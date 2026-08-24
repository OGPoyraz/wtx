import { Command } from "commander";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
  summaryWarning,
  indented,
} from "../lib/log.js";
import { gitExec, getDirtyFiles, getWorktreeList } from "../lib/git.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
  findWorktreeForBranch,
} from "../lib/resolver.js";
import { isSafeWorktreeConfig, cleanupEmptyParents, planEmptyParentRemoval } from "../lib/path-safety.js";
import { isInteractive, confirm, canProceedDeletion } from "../lib/prompts.js";

interface RemoveOptions {
  repo?: string[];
  force?: boolean;
  yes?: boolean;
}

export function registerRemoveCommand(program: Command) {
  program
    .command("remove <branch>")
    .description("Remove worktree(s)")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("-f, --force", "Force removal even if there are uncommitted changes")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (branch: string, options: RemoveOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      
      const repos = resolveRepos(config, repoFilter);
      let successCount = 0;
      let skipCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        if (!isSafeWorktreeConfig(repo.wtRoot, repo.mainPath)) {
          stepError("Path safety boundary violation", "wtRoot and mainPath cannot be the same or contain each other.");
          process.exit(1);
        }

        try {
          const candidatePath = getWorktreePath(repo, branch);

          const worktrees = await getWorktreeList(repo.mainPath);
          const target = findWorktreeForBranch(worktrees, branch, repo.mainPath, candidatePath);

          if (!target) {
            stepWarning("No worktree found", `${branch} (skipped)`);
            skipCount++;
            continue;
          }

          const wtPath = target.path;

          if (!options.force && !globalOpts.dryRun) {
            try {
              const dirtyFiles = await getDirtyFiles(wtPath);
              if (dirtyFiles.length > 0) {
                stepError("Worktree has uncommitted changes:");
                for (const file of dirtyFiles) {
                  indented(file);
                }
                indented("Use --force to remove anyway");
                skipCount++;
                continue;
              }
            } catch (err: any) {
              stepError("Failed to check for uncommitted changes", err.message);
              skipCount++;
              continue;
            }
          }

          if (!globalOpts.dryRun) {
            const interactive = isInteractive();
            const yesFlag = !!options.yes;
            const envYes = process.env.WTX_YES === "1";

            if (!canProceedDeletion({ interactive, yesFlag, envYes })) {
              stepError("Non-interactive terminal requires --yes flag or WTX_YES=1 for scripts");
              process.exit(1);
            }

            if (interactive && !yesFlag && !envYes) {
              const toClean = planEmptyParentRemoval(repo.wtRoot, repo.mainPath, wtPath);

              indented(`Will remove worktree: ${wtPath}`);
              for (const dir of toClean) {
                indented(`Will clean up empty dir: ${path.relative(repo.wtRoot, dir)}/`);
              }
              const proceed = await confirm("Are you sure you want to delete these?");
              if (!proceed) {
                stepWarning("Skipped by user", wtPath);
                skipCount++;
                continue;
              }
            }
          }

          const args = ["-C", repo.mainPath, "worktree", "remove", wtPath];
          if (options.force) {
            args.push("--force");
          }
          
          try {
            await gitExec(args, globalOpts);
            stepSuccess("Worktree removed", wtPath);
          } catch (err: any) {
            const msg = err.message || "";
            if (msg.includes("not a working tree") || msg.includes("already removed")) {
              stepWarning("Worktree already removed or invalid", msg);
              skipCount++;
              continue;
            } else {
              throw err;
            }
          }

          if (!globalOpts.dryRun) {
            const removedDirs = cleanupEmptyParents(repo.wtRoot, repo.mainPath, wtPath);
            for (const dir of removedDirs) {
              stepSuccess("Cleaned up empty directory", path.relative(repo.wtRoot, dir) + "/");
            }
          }

          successCount++;
        } catch (err: any) {
          stepError("Failed to remove worktree", err.message);
          skipCount++;
        }
      }

      if (successCount === 0 && skipCount === 0) {
        summaryWarning("No worktrees removed");
      } else if (skipCount > 0) {
        summaryWarning(`Done — ${successCount} removed, ${skipCount} skipped`);
      } else {
        summary(`Done — ${successCount} worktrees removed`);
      }
    });
}
