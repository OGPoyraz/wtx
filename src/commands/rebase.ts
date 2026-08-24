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
import { gitExec, getLatestCommit } from "../lib/git.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";

interface RebaseOptions {
  repo?: string[];
}

export function registerRebaseCommand(program: Command) {
  program
    .command("rebase <branch>")
    .description("fetch + rebase vs main branch")
    .option("--repo <repos...>", "comma-separated list of repos to target")
    .action(async (branch: string, _options: RebaseOptions, cmd: Command) => {
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
          const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
          await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, "--", mainBranch], opts);
          const commit = await getLatestCommit(repo.mainPath, `${resolvedRemote}/${mainBranch}`);
          stepProgress(`Fetching ${resolvedRemote}/${mainBranch}...`, `${commit.hash} "${commit.subject}"`);
          
          stepProgress(`Rebasing ${branch} onto main...`);
          rebaseStarted = true;
          const rebaseOut = await gitExec(["-C", wtPath, "rebase", "--", `${resolvedRemote}/${mainBranch}`], opts);
          
          if (rebaseOut.includes("is up to date") || rebaseOut.includes("up-to-date")) {
            stepSuccess("Up to date", "0 commits replayed");
          } else {
            const count = await gitExec(["-C", wtPath, "rev-list", "--count", `${resolvedRemote}/${mainBranch}..HEAD`], opts).then(s => s.trim());
            stepSuccess("Rebased", `${count} commits replayed`);
          }
          successCount++;
        } catch (err: any) {
          if (!rebaseStarted) {
            stepError("Rebase skipped — could not fetch base branch:", err.message.split("\n")[0] ?? err.message);
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
