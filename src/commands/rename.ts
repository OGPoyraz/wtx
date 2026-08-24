import { Command } from "commander";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepProgress,
  stepSuccess,
  stepError,
  summary,
  indented,
} from "../lib/log.js";
import { validateSafeBranchName } from "../lib/git.js";
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import { planRename, renameWorktree } from "../lib/rename-worktree.js";

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
        const outcome = await renameWorktree({ repo, oldBranch, newBranch, opts: globalOpts });

        for (const dir of outcome.cleanedDirs) {
          stepSuccess("Cleaned up empty directory", path.relative(repo.wtRoot, dir) + "/");
        }
        stepSuccess("Renamed", `${outcome.oldPath} → ${outcome.newPath}`);

        if (outcome.upstream) {
          indented(`Upstream still tracks '${outcome.upstream}' — after pushing run: git push -u origin ${newBranch}`);
        }

        summary(`Done — renamed ${oldBranch} to ${newBranch}`);
      } catch (err: any) {
        stepError("Rename failed", err.message);
        process.exit(1);
      }
    });
}
