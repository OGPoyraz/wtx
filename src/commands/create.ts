import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { GlobalOptions, RepoContext } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepProgress,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
  summaryWarning,
  verbose,
} from "../lib/log.js";
import { gitExec, branchExistsOnRemote } from "../lib/git.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { resolveIde, spawnIde } from "../lib/ide.js";
import { runPostCreateSetup } from "../lib/worktree-setup.js";
import { resolveForge } from "../lib/forge/index.js";
import { resolveOwnership, type Ownership } from "../lib/owner.js";

interface CreateOptions {
  repo?: string[];
  base?: string;
  open?: boolean;
  ide?: string;
  track?: boolean;
}

async function fetchPrAuthorLogin(
  repo: RepoContext,
  branch: string,
  verboseFlag: boolean
): Promise<string | null> {
  try {
    const forge = resolveForge(repo);
    if (!forge) return null;
    const prMap = await forge.findForBranches({
      cwd: repo.mainPath,
      branches: [branch],
      verbose: verboseFlag,
    });
    return prMap.get(branch)?.authorLogin ?? null;
  } catch (err) {
    verbose(`PR author lookup skipped: ${err instanceof Error ? err.message : String(err)}`, verboseFlag);
    return null;
  }
}

export function registerCreateCommand(program: Command) {
  program
    .command("create <branch>")
    .description("Create worktree(s)")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--base <ref>", "Base ref to create branch from")
    .option("-o, --open", "Open worktree(s) in IDE after creation")
    .option("--ide <editor>", "IDE to open with (used with --open)")
    .option("--track", "Track existing remote branch even if owned by someone else")
    .action(async (branch: string, options: CreateOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);

      const ide = options.open ? resolveIde(options.ide, config) : undefined;
      if (options.open && !ide) {
        stepWarning("No IDE configured", "Set via --ide, config, or $EDITOR");
      }

      const openWorktree = (wtPath: string) => {
        if (!ide) return;

        if (globalOpts.dryRun) {
          stepWarning(`Would open in ${ide}`, wtPath);
          return;
        }

        spawnIde(ide, wtPath);
        stepSuccess(`Opened in ${ide}`, wtPath);
      };

      const repos = resolveRepos(config, repoFilter);
      let successCount = 0;
      let skipCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        try {
          const wtPath = getWorktreePath(repo, branch);
          
          if (fs.existsSync(wtPath)) {
            stepWarning("Worktree already exists", `${wtPath} (skipped)`);
            skipCount++;
            openWorktree(wtPath);
            continue;
          }

          if (!globalOpts.dryRun) {
            fs.mkdirSync(path.dirname(wtPath), { recursive: true });
          }

          stepProgress("Checking remote branch...");
          const mainBranch = await resolveMainBranch(repo, config);
          const baseRef = options.base || `origin/${mainBranch}`;
          
          const remoteExists = await branchExistsOnRemote(repo.mainPath, branch, globalOpts);

          let ownership: Ownership | null = null;
          if (remoteExists && !options.track) {
            const prAuthorLogin = await fetchPrAuthorLogin(repo, branch, globalOpts.verbose);
            ownership = await resolveOwnership({
              configUser: config.user,
              mainPath: repo.mainPath,
              branch,
              prAuthorLogin,
              verbose: globalOpts.verbose,
            });

            if (ownership && !ownership.mine) {
              stepWarning(
                `Remote branch ${branch} belongs to ${ownership.author}`,
                `creating your own from ${baseRef} instead — use --track to track theirs`
              );
            }
          } else if (remoteExists && options.track) {
            verbose(`Tracking forced via --track`, globalOpts.verbose);
          }

          if (!remoteExists || (ownership && !ownership.mine)) {
            verbose(`Creating ${branch} from ${baseRef}`, globalOpts.verbose);
            await gitExec(["-C", repo.mainPath, "worktree", "add", "-b", branch, wtPath, baseRef], globalOpts);
          } else {
            stepSuccess(
              ownership ? "Tracking your remote branch" : "Tracking existing remote branch",
              branch
            );
            try {
              await gitExec(["-C", repo.mainPath, "worktree", "add", "--track", "-b", branch, wtPath, `origin/${branch}`], globalOpts);
            } catch (err) {
              verbose(`Tracking failed, assuming local branch exists. Falling back to local branch...`, globalOpts.verbose);
              await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
            }
          }
          
          stepSuccess("Worktree created", wtPath);

          await runPostCreateSetup({ config, repo, wtPath, branch, globalOpts });

          openWorktree(wtPath);

          successCount++;
        } catch (err: any) {
          stepError("Failed to create worktree", err.message);
        }
      }

      if (successCount === 0 && skipCount === 0) {
        summaryWarning("No worktrees created");
      } else if (skipCount > 0) {
        summaryWarning(`Done — ${successCount} created, ${skipCount} skipped`);
      } else {
        summary(`Done — ${successCount} worktrees created`);
      }
    });
}
