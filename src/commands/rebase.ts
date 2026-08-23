import { Command } from "commander";
import fs from "fs";
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

      for (const repo of repos) {
        repoHeader(repo.name);
        
        const mainBranch = await resolveMainBranch(repo, config);
        const wtPath = getWorktreePath(repo, branch);
        
        if (!fs.existsSync(wtPath)) {
          stepError("No worktree found", `${wtPath} (skipped)`);
          continue;
        }

        try {
          const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
          await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, "--", mainBranch], opts);
          const commit = await getLatestCommit(repo.mainPath, `${resolvedRemote}/${mainBranch}`);
          stepProgress(`Fetching ${resolvedRemote}/${mainBranch}...`, `${commit.hash} "${commit.subject}"`);
          
          stepProgress(`Rebasing ${branch} onto main...`);
          const rebaseOut = await gitExec(["-C", wtPath, "rebase", "--", `${resolvedRemote}/${mainBranch}`], opts);
          
          if (rebaseOut.includes("is up to date") || rebaseOut.includes("up-to-date")) {
            stepSuccess("Up to date", "0 commits replayed");
          } else {
            const count = await gitExec(["-C", wtPath, "rev-list", "--count", `${resolvedRemote}/${mainBranch}..HEAD`], opts).then(s => s.trim());
            stepSuccess("Rebased", `${count} commits replayed`);
          }
          successCount++;
        } catch (err: any) {
          stepError("Rebase conflict:");
          
          try {
            const statusStdout = await gitExec(["-C", wtPath, "status", "--porcelain"], opts);
            const lines = statusStdout.split("\n");
            for (const line of lines) {
              if (line.startsWith("UU ") || line.startsWith("AA ") || line.startsWith("AU ") || line.startsWith("UA ")) {
                indented(`CONFLICT (content): ${line.substring(3)}`);
              }
            }
          } catch (e) {
          }
          
          indented(`Resolve, then run:`);
          indented(`  cd ${wtPath} && git rebase --continue`);
        }
      }
      
      summary(`Done — ${successCount} repos rebased`);
    });
}
