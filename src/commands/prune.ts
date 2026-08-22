import { Command } from "commander";
import fs from "fs";
import path from "path";
import chalk from "chalk";
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
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import { resolveForge } from "../lib/forge/index.js";
import { selectMergedCandidates } from "../lib/prune.js";

interface PruneOptions {
  repo?: string[];
  force?: boolean;
}

function cleanupEmptyParentDirs(wtRoot: string, removedPath: string): void {
  let currentDir = path.dirname(removedPath);
  while (currentDir.startsWith(wtRoot) && currentDir !== wtRoot) {
    try {
      if (fs.readdirSync(currentDir).length === 0) {
        fs.rmdirSync(currentDir);
        stepSuccess("Cleaned up empty directory", path.relative(wtRoot, currentDir) + "/");
      } else {
        break;
      }
    } catch {
      break;
    }
    currentDir = path.dirname(currentDir);
  }
}

export function registerPruneCommand(program: Command) {
  program
    .command("prune")
    .description("Remove worktrees whose branch has a merged PR")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("-f, --force", "Remove even if there are uncommitted changes")
    .action(async (options: PruneOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);

      let removedCount = 0;
      let skippedCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);

        const forge = resolveForge(repo);
        if (!forge) {
          stepWarning("No forge configured", "cannot detect merged PRs (skipped)");
          skippedCount++;
          continue;
        }

        try {
          const worktrees = await getWorktreeList(repo.mainPath);
          const branches = worktrees
            .filter((wt) => wt.path !== repo.mainPath && wt.branch)
            .map((wt) => wt.branch);

          if (branches.length === 0) {
            continue;
          }

          const prMap = await forge.findForBranches({
            cwd: repo.mainPath,
            branches,
            verbose: globalOpts.verbose,
          });

          const candidates = selectMergedCandidates(worktrees, repo.mainPath, prMap);
          if (candidates.length === 0) {
            indented(chalk.dim("No merged PRs to clean up"));
            continue;
          }

          for (const candidate of candidates) {
            const label = `${candidate.branch} (#${candidate.prNumber})`;
            const wtInfo = worktrees.find((wt) => wt.path === candidate.path);

            if (wtInfo?.isLocked && !options.force) {
              stepWarning("Skipped — worktree is locked 🔒", label);
              skippedCount++;
              continue;
            }

            if (!options.force && !globalOpts.dryRun) {
              try {
                const dirtyFiles = await getDirtyFiles(candidate.path);
                if (dirtyFiles.length > 0) {
                  stepWarning(
                    `Skipped — ${dirtyFiles.length} uncommitted file${dirtyFiles.length > 1 ? "s" : ""}`,
                    `${label}; use --force`
                  );
                  skippedCount++;
                  continue;
                }
              } catch {
                stepError("Failed to inspect worktree", label);
                skippedCount++;
                continue;
              }
            }

            const args = ["-C", repo.mainPath, "worktree", "remove", candidate.path];
            if (options.force) {
              args.push("--force");
            }

            try {
              await gitExec(args, globalOpts);
              stepSuccess("Worktree removed", label);
              if (!globalOpts.dryRun) {
                cleanupEmptyParentDirs(repo.wtRoot, candidate.path);
              }
              removedCount++;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              stepError("Failed to remove worktree", `${label}: ${message}`);
              skippedCount++;
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          stepWarning("PR lookup failed", message);
          skippedCount++;
        }
      }

      if (removedCount === 0 && skippedCount === 0) {
        summary("No merged worktrees to prune");
      } else if (skippedCount > 0) {
        summaryWarning(`Done — ${removedCount} removed, ${skippedCount} skipped`);
      } else {
        summary(`Done — ${removedCount} worktree${removedCount > 1 ? "s" : ""} removed`);
      }
    });
}
