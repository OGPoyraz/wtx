import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { GlobalOptions } from "../types.js";
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

interface CreateOptions {
  repo?: string[];
  base?: string;
  open?: boolean;
  ide?: string;
}

export function registerCreateCommand(program: Command) {
  program
    .command("create <branch>")
    .description("Create worktree(s)")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--base <ref>", "Base ref to create branch from")
    .option("-o, --open", "Open worktree(s) in IDE after creation")
    .option("--ide <editor>", "IDE to open with (used with --open)")
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
          
          if (remoteExists) {
            verbose(`Remote branch found on origin, tracking`, globalOpts.verbose);
            try {
              await gitExec(["-C", repo.mainPath, "worktree", "add", "--track", "-b", branch, wtPath, `origin/${branch}`], globalOpts);
            } catch (err) {
              verbose(`Tracking failed, assuming local branch exists. Falling back to local branch...`, globalOpts.verbose);
              await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
            }
          } else {
            verbose(`Remote branch not found, creating from ${baseRef}`, globalOpts.verbose);
            await gitExec(["-C", repo.mainPath, "worktree", "add", "-b", branch, wtPath, baseRef], globalOpts);
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
