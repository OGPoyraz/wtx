import { Command } from "commander";
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
  indented,
} from "../lib/log.js";
import { validateSafeBranchName } from "../lib/git.js";
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import { planRename, renameWorktree } from "../lib/rename-worktree.js";
import { renameStackEntry } from "../lib/stack.js";
import { getWorkspaceRoot } from "../lib/workspace.js";

interface RenameOptions {
  repo?: string[];
}

export function registerRenameCommand(program: Command) {
  program
    .command("rename <old-branch> <new-branch>")
    .description("Rename a worktree's branch and move its checkout to the new location")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .action(async (oldBranch: string, newBranch: string, options: RenameOptions) => {
      const globalOpts = program.opts<GlobalOptions>();

      if (!validateSafeBranchName(newBranch)) {
        stepError(`Invalid branch name: '${newBranch}'`);
        process.exit(1);
      }
      if (oldBranch === newBranch) {
        stepError("Branch names identical", "nothing to do");
        process.exit(1);
      }

      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      let repos;
      try {
        repos = resolveRepos(config, repoFilter);
      } catch (err: any) {
        stepError("Failed to resolve repo", err.message);
        process.exit(1);
      }

      if (repos.length > 1) {
        stepError("Multiple repos targeted", "run inside the repo/worktree or pass --repo");
        process.exit(1);
      }

      const repo = repos[0]!;
      repoHeader(repo.name);

      try {
        const planned = await planRename(repo, oldBranch, newBranch, globalOpts);

        if (globalOpts.dryRun) {
          stepSuccess("Would rename branch", `${oldBranch} → ${newBranch}`);
          stepSuccess("Would move checkout", planned.newPath);
          summary(`Done — dry run, nothing changed`);
          return;
        }

        stepProgress(`Renaming ${oldBranch} → ${newBranch}...`);
        const outcome = await renameWorktree({ repo, oldBranch, newBranch, opts: globalOpts, workspaceRoot: getWorkspaceRoot(config) });

        for (const dir of outcome.cleanedDirs) {
          stepSuccess("Cleaned up empty directory", path.relative(repo.wtRoot, dir) + "/");
        }
        stepSuccess("Renamed", `${outcome.oldPath} → ${outcome.newPath}`);

        if (outcome.dirtyFiles.length > 0) {
          stepSuccess("Carried uncommitted files", `${outcome.dirtyFiles.length} entr${outcome.dirtyFiles.length === 1 ? "y" : "ies"} moved with the checkout`);
        }
        if (outcome.lostDirtyFiles.length > 0) {
          stepError("Uncommitted changes missing after rename", outcome.lostDirtyFiles.join(", "));
        }

        if (outcome.resyncedFiles.length > 0) {
          stepSuccess("Synced files", outcome.resyncedFiles.join(", "));
        }
        for (const entry of outcome.keptLocalSyncFiles) {
          indented(`Kept local version of ${entry} — it has uncommitted edits`);
        }
        for (const workspace of outcome.updatedWorkspaces) {
          stepWarning(`Unlinked from workspace "${workspace}"`, "relinked to the renamed branch");
        }
        for (const warning of outcome.workspaceWarnings) {
          stepWarning("Workspace updated", warning);
        }

        if (outcome.upstream) {
          indented(`Upstream still tracks '${outcome.upstream}' — after pushing run: git push -u origin ${newBranch}`);
        }

        try {
          await renameStackEntry(repo.mainPath, oldBranch, newBranch, globalOpts);
          stepSuccess("Updated stack metadata", newBranch);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          stepWarning("Stack metadata not updated", message);
        }

        summary(`Done — renamed ${oldBranch} to ${newBranch}`);
      } catch (err: any) {
        stepError("Rename failed", err.message);
        process.exit(1);
      }
    });
}
