import { Command } from "commander";
import fs from "fs";
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
import { gitExec, getLatestCommit, resolveCommitSha } from "../lib/git.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { readStackMetadata, recordStackEntry } from "../lib/stack.js";

interface RebaseOptions {
  repo?: string[];
  onto?: string;
}

export function registerRebaseCommand(program: Command) {
  program
    .command("rebase <branch>")
    .description("fetch + rebase worktree onto its base")
    .option("--repo <repos...>", "comma-separated list of repos to target")
    .option("--onto <ref>", "Override the recorded base ref for this rebase")
    .action(async (branch: string, options: RebaseOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as GlobalOptions & RebaseOptions;
      
      const config = loadConfig();
      const targetRepos = parseRepoFlag(opts.repo);
      const repos = resolveRepos(config, targetRepos);
      
      let successCount = 0;
      let failCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        const mainBranch = await resolveMainBranch(repo, config);
        const wtPath = getWorktreePath(repo, branch);
        
        if (!fs.existsSync(wtPath)) {
          stepError("No worktree found", `${wtPath} (skipped)`);
          failCount++;
          continue;
        }

        let rebaseStarted = false;
        try {
          const metadata = await readStackMetadata(repo.mainPath, opts);
          const recorded = metadata.branches[branch];
          const resolvedRemote = !options.onto && !recorded?.explicit
            ? await resolveBaseRemote(repo.mainPath, mainBranch)
            : undefined;
          const defaultBase = resolvedRemote ? `${resolvedRemote}/${mainBranch}` : mainBranch;
          const baseRef = options.onto || (recorded?.explicit ? recorded.baseRef : defaultBase);
          const shouldFetchMain = !options.onto && (!recorded || !recorded.explicit);

          if (shouldFetchMain) {
            if (!resolvedRemote) {
              throw new Error(`Could not determine the remote for base branch '${mainBranch}'`);
            }
            await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, "--", mainBranch], opts);
            const commit = await getLatestCommit(repo.mainPath, defaultBase);
            stepProgress(`Fetching ${resolvedRemote}/${mainBranch}...`, `${commit.hash} "${commit.subject}"`);
          } else {
            stepProgress("Using recorded base", baseRef);
          }

          const baseSha = await resolveCommitSha(repo.mainPath, baseRef, opts);
          
          stepProgress(`Rebasing ${branch} onto ${baseRef}...`);
          rebaseStarted = true;
          const rebaseOut = await gitExec(["-C", wtPath, "rebase", "--", baseRef], opts);
          
          if (rebaseOut.includes("is up to date") || rebaseOut.includes("up-to-date")) {
            stepSuccess("Up to date", "0 commits replayed");
          } else {
            const count = await gitExec(["-C", wtPath, "rev-list", "--count", `${baseRef}..HEAD`], opts).then(s => s.trim());
            stepSuccess("Rebased", `${count} commits replayed`);
          }

          if (recorded || options.onto) {
            const metadataBaseRef = options.onto || (recorded?.explicit ? baseRef : mainBranch);
            try {
              await recordStackEntry(repo.mainPath, branch, {
                baseRef: metadataBaseRef,
                baseSha,
                explicit: options.onto ? true : recorded?.explicit ?? true,
                createdAt: recorded?.createdAt || new Date().toISOString(),
              }, opts);
              stepSuccess("Base recorded", metadataBaseRef);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              stepWarning("Base metadata not updated", message);
            }
          }
          successCount++;
        } catch (err: any) {
          if (!rebaseStarted) {
            stepError("Rebase skipped — could not resolve base:", err.message.split("\n")[0] ?? err.message);
            failCount++;
            continue;
          }

          stepError("Rebase failed — manual merge needed:", err.message.split("\n")[0] ?? err.message);

          try {
            await gitExec(["-C", wtPath, "rebase", "--abort"], opts);
            stepWarning("Rebase aborted", `${branch} restored to its pre-rebase state`);
          } catch {
            indented("Could not auto-abort — resolve manually:");
            indented(`  cd ${wtPath} && git status`);
          }
          failCount++;
        }
      }
      
      if (failCount > 0) {
        summary(`Done — ${successCount} rebased, ${failCount} failed`);
        process.exit(1);
      }

      summary(`Done — ${successCount} repos rebased`);
    });
}
