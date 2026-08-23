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
import { gitExec, getLatestCommit, getLocalBranchSha, getRemoteBranchSha, getWorktreeList } from "../lib/git.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import { resolveBranchTarget } from "../lib/branch-resolution.js";
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
  local?: boolean;
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
    .option("--local", "Use local branch even if diverged from remote")
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
      let hookFailures = false;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        try {
          const wtPath = getWorktreePath(repo, branch);
          
          const wts = await getWorktreeList(repo.mainPath);
          if (wts.some(wt => wt.path === wtPath)) {
            stepWarning("Worktree already exists", `${wtPath} (skipped)`);
            skipCount++;
            openWorktree(wtPath);
            continue;
          }

          if (!globalOpts.dryRun) {
            fs.mkdirSync(path.dirname(wtPath), { recursive: true });
          }

          const mainBranch = await resolveMainBranch(repo, config);
          const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);

          if (repo.config.fetch_main_on_create) {
            stepProgress(`Fetching ${resolvedRemote}/${mainBranch}...`);
            await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, mainBranch], globalOpts);
            const commit = await getLatestCommit(repo.mainPath, `${resolvedRemote}/${mainBranch}`);
            stepSuccess(`Fetched ${resolvedRemote}/${mainBranch}`, `${commit.hash} "${commit.subject}"`);
          }

          stepProgress("Checking branch status...");
          const baseRef = options.base || `${resolvedRemote}/${mainBranch}`;
          
          const localSha = await getLocalBranchSha(repo.mainPath, branch, globalOpts);
          const remoteSha = await getRemoteBranchSha(repo.mainPath, resolvedRemote, branch, globalOpts);

          const localExists = localSha !== null;
          const remoteExists = remoteSha !== null;

          const target = resolveBranchTarget({ localExists, localSha, remoteExists, remoteSha });

          let ownership: Ownership | null = null;
          if (remoteExists && !options.track && target.kind !== "diverged") {
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

          const resolvedAction = (ownership && !ownership.mine) ? { kind: "create-new" } : target;

          try {
            if (resolvedAction.kind === "create-new") {
              verbose(`Creating ${branch} from ${baseRef}`, globalOpts.verbose);
              await gitExec(["-C", repo.mainPath, "worktree", "add", "-b", branch, wtPath, baseRef], globalOpts);
            } else if (resolvedAction.kind === "use-local") {
              verbose(`Using existing local branch ${branch}`, globalOpts.verbose);
              await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
            } else if (resolvedAction.kind === "track-remote") {
              if (localExists) {
                stepSuccess("Using existing tracking branch", branch);
                await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
              } else {
                stepSuccess(
                  ownership ? "Tracking your remote branch" : "Tracking existing remote branch",
                  branch
                );
                await gitExec(["-C", repo.mainPath, "worktree", "add", "--track", "-b", branch, wtPath, `${resolvedRemote}/${branch}`], globalOpts);
              }
            } else if (resolvedAction.kind === "diverged") {
              if (options.track) {
                stepSuccess("Tracking forced over diverged local branch", branch);
                await gitExec(["-C", repo.mainPath, "worktree", "add", "-B", branch, wtPath, `${resolvedRemote}/${branch}`], globalOpts);
              } else if (options.local) {
                stepSuccess("Local forced over diverged remote branch", branch);
                await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
              } else {
                const shortLocal = localSha!.substring(0, 7);
                const shortRemote = remoteSha!.substring(0, 7);
                throw new Error(`Branch diverged: local (${shortLocal}) differs from remote (${shortRemote}). Use --track to overwrite local or --local to ignore remote.`);
              }
            }
          } catch (err: any) {
            const stderr = err.stderr || err.message || "";
            if (stderr.includes("already exists") || stderr.includes("not a working tree")) {
              stepWarning("Worktree collision", `${wtPath} (skipped due to git error)`);
              skipCount++;
              continue; // warn and skip, preserving exit-code semantics
            }
            throw err;
          }

          stepSuccess("Worktree created", wtPath);

          const setupResult = await runPostCreateSetup({ config, repo, wtPath, branch, globalOpts });
          if (setupResult && setupResult.hooks) {
            const failedHooks = setupResult.hooks.filter(h => !h.ok);
            if (failedHooks.length > 0) {
              const hookMsgs = failedHooks.map(h => `  - ${h.command} (exit code: ${h.exitCode})`).join("\n");
              stepError("Hook failures", `Some hooks failed:\n${hookMsgs}\nRe-run via: wtx sync ${branch}`);
              hookFailures = true;
            }
          }

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

      if (hookFailures) {
        process.exit(1);
      }
    });
}
