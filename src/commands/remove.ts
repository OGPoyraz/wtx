import { Command } from "commander";
import fs from "fs";
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
import { gitExec, getDirtyFiles, getWorktreeList, localBranchExists } from "../lib/git.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
  findWorktreeForBranch,
} from "../lib/resolver.js";
import { isSafeWorktreeConfig, cleanupEmptyParents, planEmptyParentRemoval } from "../lib/path-safety.js";
import { isInteractive, confirm, canProceedDeletion } from "../lib/prompts.js";
import { getStackChildren, readStackMetadata, removeStackEntry } from "../lib/stack.js";

interface RemoveOptions {
  repo?: string[];
  force?: boolean;
  yes?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMissingWorktreePathError(message: string): boolean {
  return message.includes("ENOENT")
    || message.includes("No such file")
    || message.includes("does not exist")
    || message.includes("not a git repository")
    || message.includes("cannot change to");
}

function isRecoverableWorktreeRemoveError(message: string): boolean {
  return message.includes("not a working tree")
    || message.includes("already removed")
    || message.includes("submodule")
    || message.includes("containing submodules")
    || isMissingWorktreePathError(message);
}

function removeExistingPath(wtPath: string, opts: GlobalOptions): void {
  if (!opts.dryRun && fs.existsSync(wtPath)) {
    fs.rmSync(wtPath, { recursive: true, force: true });
  }
}

async function removeLocalBranchIfExists(
  repoPath: string,
  branch: string,
  opts: GlobalOptions
): Promise<void> {
  if (await localBranchExists(repoPath, branch, opts)) {
    await gitExec(["-C", repoPath, "branch", "-D", branch], opts);
  }
}

async function removeLocalBranchBestEffort(
  repoPath: string,
  branch: string,
  opts: GlobalOptions
): Promise<void> {
  try {
    await removeLocalBranchIfExists(repoPath, branch, opts);
  } catch (err: unknown) {
    stepWarning("Local branch not removed", errorMessage(err));
  }
}

async function finishCleanup(
  repo: { wtRoot: string; mainPath: string },
  wtPath: string,
  branch: string,
  opts: GlobalOptions
): Promise<void> {
  if (!opts.dryRun) {
    const removedDirs = cleanupEmptyParents(repo.wtRoot, repo.mainPath, wtPath);
    for (const dir of removedDirs) {
      stepSuccess("Cleaned up empty directory", path.relative(repo.wtRoot, dir) + "/");
    }
  }

  try {
    await removeStackEntry(repo.mainPath, branch, opts);
  } catch (err: unknown) {
    stepWarning("Stack metadata not removed", errorMessage(err));
  }
}

async function confirmDeletionIfNeeded(
  repo: { wtRoot: string; mainPath: string },
  wtPath: string,
  options: RemoveOptions,
  globalOpts: GlobalOptions
): Promise<boolean> {
  if (globalOpts.dryRun) return true;

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
      return false;
    }
  }

  return true;
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
            if (options.force && (fs.existsSync(candidatePath) || await localBranchExists(repo.mainPath, branch, globalOpts))) {
              if (!(await confirmDeletionIfNeeded(repo, candidatePath, options, globalOpts))) {
                skipCount++;
                continue;
              }
              removeExistingPath(candidatePath, globalOpts);
              await removeLocalBranchBestEffort(repo.mainPath, branch, globalOpts);
              await finishCleanup(repo, candidatePath, branch, globalOpts);
              stepSuccess("Worktree removed", candidatePath);
              successCount++;
              continue;
            }

            stepWarning("No worktree found", `${branch} (skipped)`);
            skipCount++;
            continue;
          }

          const wtPath = target.path;
          const stackMetadata = await readStackMetadata(repo.mainPath, globalOpts);
          const children = getStackChildren(stackMetadata, branch);
          if (children.length > 0 && !options.force) {
            stepError(
              "Worktree has dependent branches",
              `${children.join(", ")} — retarget or remove them first (use --force to override)`
            );
            skipCount++;
            continue;
          }
          if (children.length > 0) {
            stepWarning("Removing a parent with dependent branches", children.join(", "));
          }

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
            } catch (err: unknown) {
              const msg = errorMessage(err);
              if (isMissingWorktreePathError(msg) || !fs.existsSync(wtPath)) {
                stepWarning("Worktree path missing", "continuing with removal cleanup");
              } else {
                stepError("Failed to check for uncommitted changes", msg);
                skipCount++;
                continue;
              }
            }
          }

          if (options.force && !globalOpts.dryRun && !fs.existsSync(wtPath)) {
            if (!(await confirmDeletionIfNeeded(repo, wtPath, options, globalOpts))) {
              skipCount++;
              continue;
            }
            try {
              await gitExec(["-C", repo.mainPath, "worktree", "prune"], globalOpts);
            } catch (err: unknown) {
              stepWarning("Worktree prune failed", errorMessage(err));
            }
            await removeLocalBranchBestEffort(repo.mainPath, branch, globalOpts);
            await finishCleanup(repo, wtPath, branch, globalOpts);
            stepSuccess("Worktree removed", wtPath);
            if (children.length > 0) {
              stepWarning("Dependent base metadata retained", children.join(", "));
            }
            successCount++;
            continue;
          }

          if (!(await confirmDeletionIfNeeded(repo, wtPath, options, globalOpts))) {
            skipCount++;
            continue;
          }

          const args = ["-C", repo.mainPath, "worktree", "remove", wtPath];
          if (options.force) {
            args.push("--force");
          }
          
          try {
            await gitExec(args, globalOpts);
            stepSuccess("Worktree removed", wtPath);
          } catch (err: unknown) {
            const msg = errorMessage(err);
            const isSubmodule = msg.includes("submodule") || msg.includes("containing submodules");
            if (isSubmodule && !options.force && !args.includes("--force")) {
              stepWarning("Worktree contains submodules — retrying with --force", msg.split("\n")[0] ?? msg);
              try {
                await gitExec(["-C", repo.mainPath, "worktree", "remove", "--force", wtPath], globalOpts);
                stepSuccess("Worktree removed", wtPath);
              } catch (forceErr: unknown) {
                const forceMsg = errorMessage(forceErr);
                if (isRecoverableWorktreeRemoveError(forceMsg)) {
                  stepWarning("Worktree already removed or invalid", forceMsg);
                  try {
                    await gitExec(["-C", repo.mainPath, "worktree", "prune"], globalOpts);
                  } catch (pruneErr: unknown) {
                    stepWarning("Worktree prune failed", errorMessage(pruneErr));
                  }
                  removeExistingPath(wtPath, globalOpts);
                  await removeLocalBranchBestEffort(repo.mainPath, branch, globalOpts);
                  stepSuccess("Worktree removed", wtPath);
                } else {
                  throw forceErr;
                }
              }
            } else if (isRecoverableWorktreeRemoveError(msg)) {
              stepWarning("Worktree already removed or invalid", msg);
              try {
                await gitExec(["-C", repo.mainPath, "worktree", "prune"], globalOpts);
              } catch (pruneErr: unknown) {
                stepWarning("Worktree prune failed", errorMessage(pruneErr));
              }
              removeExistingPath(wtPath, globalOpts);
              await removeLocalBranchBestEffort(repo.mainPath, branch, globalOpts);
              stepSuccess("Worktree removed", wtPath);
            } else {
              throw err;
            }
          }

          await finishCleanup(repo, wtPath, branch, globalOpts);
          if (children.length > 0) {
            stepWarning("Dependent base metadata retained", children.join(", "));
          }

          successCount++;
        } catch (err: unknown) {
          stepError("Failed to remove worktree", errorMessage(err));
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
