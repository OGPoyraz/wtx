import { Command } from "commander";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepProgress,
  stepSuccess,
  stepError,
  summary,
  summaryWarning,
} from "../lib/log.js";
import { gitExec, getWorktreeList } from "../lib/git.js";
import {
  resolveRepos,
  detectRepoFromCwd,
  findWorktreeForBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";

interface PullBranchOptions {
  repo?: string[];
}

export function registerPullBranchCommand(program: Command) {
  program
    .command("pull-branch [branch]")
    .description("Fast-forward pull latest changes for a worktree's branch")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .action(async (branch: string | undefined, options: PullBranchOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as GlobalOptions & PullBranchOptions;

      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);

      let resolvedFilter = repoFilter;
      if (!resolvedFilter || resolvedFilter.length === 0) {
        const detected = detectRepoFromCwd(config);
        if (!detected) {
          stepError("Repo could not be detected", "run inside a managed repo or worktree, or pass --repo");
          process.exit(1);
        }
        resolvedFilter = [detected];
      }

      const repos = resolveRepos(config, resolvedFilter);
      let successCount = 0;
      let failCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);

        let branchToPull = branch;
        if (!branchToPull) {
          try {
            const head = await gitExec(["-C", process.cwd(), "rev-parse", "--abbrev-ref", "HEAD"], opts);
            branchToPull = head.trim();
          } catch {
            stepError("No branch specified", "pass a branch or run inside a worktree");
            failCount++;
            continue;
          }
          if (!branchToPull || branchToPull === "HEAD") {
            stepError("Detached HEAD", "pass a branch explicitly");
            failCount++;
            continue;
          }
        }

        const candidatePath = getWorktreePath(repo, branchToPull);
        const list = await getWorktreeList(repo.mainPath);
        const target = findWorktreeForBranch(list, branchToPull, repo.mainPath, candidatePath);

        if (!target) {
          stepError(`No worktree found for branch '${branchToPull}'`, candidatePath);
          failCount++;
          continue;
        }

        const wtPath = target.path;

        try {
          stepProgress(`Pulling ${branchToPull}...`);
          await gitExec(["-C", wtPath, "pull", "--ff-only"], opts);
          stepSuccess("Pulled", wtPath);
          successCount++;
        } catch (err: any) {
          const msg = err.message || "";
          if (msg.includes("no tracking information")) {
            stepError("No upstream configured", `set one with: git -C ${wtPath} branch --set-upstream-to=origin/${branchToPull}`);
          } else if (msg.includes("fast-forward") || msg.includes("divergent") || msg.includes("conflict")) {
            stepError("Cannot fast-forward", "local commits diverge from upstream — run 'wtx rebase' instead");
          } else if (msg.includes("would be overwritten") || msg.includes("uncommitted")) {
            stepError("Uncommitted changes block merge", `commit, stash, or remove them in ${wtPath}`);
          } else {
            stepError("Pull failed", msg.split("\n")[0] ?? msg);
          }
          failCount++;
        }
      }

      if (successCount === 0 && failCount === 0) {
        summaryWarning("Nothing pulled");
      } else if (failCount > 0) {
        summary(`Done — ${successCount} pulled, ${failCount} failed`);
        if (successCount === 0) process.exit(1);
      } else {
        summary(`Done — ${successCount} branch(es) pulled`);
      }
    });
}
