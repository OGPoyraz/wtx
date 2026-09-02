import { Command } from "commander";
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
import type { Worktree } from "../lib/git.js";
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import type { RepoContext } from "../types.js";
import { resolveForge } from "../lib/forge/index.js";
import { selectMergedCandidates } from "../lib/prune.js";
import type { PruneCandidate } from "../lib/prune.js";
import { isSafeWorktreeConfig, cleanupEmptyParents, safeResolve } from "../lib/path-safety.js";
import { isInteractive, confirm, canProceedDeletion } from "../lib/prompts.js";
import { getStackChildren, readStackMetadata, removeStackEntry } from "../lib/stack.js";
import { findWorkspacesForMember, getWorkspaceRoot, removeMember } from "../lib/workspace.js";

interface PruneOptions {
  repo?: string[];
  force?: boolean;
  yes?: boolean;
}

interface PruneAction {
  repo: RepoContext;
  candidate: PruneCandidate;
  label: string;
  worktrees: Worktree[];
}

export function registerPruneCommand(program: Command) {
  program
    .command("prune")
    .description("Remove worktrees whose branch has a merged PR")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("-f, --force", "Remove even if there are uncommitted changes")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (options: PruneOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const workspaceRoot = getWorkspaceRoot(config);
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);

      let removedCount = 0;
      let skippedCount = 0;

      const actionsToRun: PruneAction[] = [];

      for (const repo of repos) {
        repoHeader(repo.name);

        if (!isSafeWorktreeConfig(repo.wtRoot, repo.mainPath)) {
          stepError("Path safety boundary violation", "wtRoot and mainPath cannot be the same or contain each other.");
          process.exit(1);
        }

        const forge = resolveForge(repo);
        if (!forge) {
          stepWarning("No forge configured", "cannot detect merged PRs (skipped)");
          skippedCount++;
          continue;
        }

        try {
          const worktrees = await getWorktreeList(repo.mainPath);
          const stackMetadata = await readStackMetadata(repo.mainPath, globalOpts);
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
            const resolvedCandidatePath = safeResolve(candidate.path);
            const isRegistered = worktrees.some(wt => safeResolve(wt.path) === resolvedCandidatePath);
            if (!isRegistered) {
              stepWarning("Skipped — unregistered worktree", label);
              skippedCount++;
              continue;
            }

            const wtInfo = worktrees.find((wt) => wt.path === candidate.path);
            const children = getStackChildren(stackMetadata, candidate.branch);
            if (children.length > 0 && !options.force) {
              stepWarning("Skipped — branch has dependent worktrees", `${label}: ${children.join(", ")}`);
              skippedCount++;
              continue;
            }
            if (children.length > 0) {
              stepWarning("Pruning parent with dependent worktrees", `${label}: ${children.join(", ")}`);
            }

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

            actionsToRun.push({ repo, candidate, label, worktrees });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          stepWarning("PR lookup failed", message);
          skippedCount++;
        }
      }

      if (actionsToRun.length > 0 && !globalOpts.dryRun) {
        const interactive = isInteractive();
        const yesFlag = !!options.yes;
        const envYes = process.env.WTX_YES === "1";

        if (!canProceedDeletion({ interactive, yesFlag, envYes })) {
          stepError("Non-interactive terminal requires --yes flag or WTX_YES=1 for scripts");
          process.exit(1);
        }

        if (interactive && !yesFlag && !envYes) {
          console.log();
          indented(`Will remove ${actionsToRun.length} worktree${actionsToRun.length > 1 ? "s" : ""}:`);
          for (const action of actionsToRun) {
            indented(`- ${action.candidate.path} (${action.label})`);
          }
          const proceed = await confirm("Are you sure you want to delete these?");
          if (!proceed) {
            summaryWarning("Prune cancelled by user");
            return;
          }
          console.log();
        }
      }

      let currentRepo = null;
      for (const action of actionsToRun) {
        const { repo, candidate, label } = action;
        
        if (currentRepo !== repo.name) {
          if (currentRepo !== null) {
            console.log();
          }
          repoHeader(repo.name);
          currentRepo = repo.name;
        }

        const args = ["-C", repo.mainPath, "worktree", "remove", candidate.path];
        if (options.force) {
          args.push("--force");
        }

        try {
          await gitExec(args, globalOpts);
          stepSuccess("Worktree removed", label);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("not a working tree") || msg.includes("already removed")) {
            stepWarning("Worktree already removed or invalid", msg);
            skippedCount++;
            continue;
          }
          stepError("Failed to remove worktree", `${label}: ${msg}`);
          skippedCount++;
          continue;
        }

        if (!globalOpts.dryRun) {
          const removedDirs = cleanupEmptyParents(repo.wtRoot, repo.mainPath, candidate.path);
          for (const dir of removedDirs) {
            stepSuccess("Cleaned up empty directory", path.relative(repo.wtRoot, dir) + "/");
          }
        }
        try {
          await removeStackEntry(repo.mainPath, candidate.branch, globalOpts);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          stepWarning("Stack metadata not removed", message);
        }
        try {
          const affectedWorkspaces = await findWorkspacesForMember(workspaceRoot, repo.name, candidate.branch);
          for (const workspace of affectedWorkspaces) {
            try {
              await removeMember({ workspacePath: path.join(workspaceRoot, workspace), repo: repo.name, branch: candidate.branch });
              stepWarning(`Unlinked from workspace "${workspace}"`);
            } catch (err: unknown) {
              stepWarning(`Failed to unlink workspace "${workspace}"`, err instanceof Error ? err.message : String(err));
            }
          }
        } catch (err: unknown) {
          stepWarning("Workspace unlink failed", err instanceof Error ? err.message : String(err));
        }
        removedCount++;
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
