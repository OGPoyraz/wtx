import { Command } from "commander";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepSuccess,
  stepError,
  summary,
} from "../lib/log.js";
import { gitExec, getLatestCommit } from "../lib/git.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import {
  resolveRepos,
  resolveMainBranch,
  parseRepoFlag,
} from "../lib/resolver.js";

interface FetchOptions {
  repo?: string[];
}

export function registerFetchCommand(program: Command) {
  program
    .command("fetch")
    .description("fetch <remote> <main_branch>")
    .option("--repo <repos...>", "comma-separated list of repos to target")
    .action(async (_options: FetchOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as GlobalOptions & FetchOptions;
      
      const config = loadConfig();
      const targetRepos = parseRepoFlag(opts.repo);
      const repos = resolveRepos(config, targetRepos);
      
      let successCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        try {
          const mainBranch = await resolveMainBranch(repo, config);
          const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
          await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, mainBranch], opts);
          const commit = await getLatestCommit(repo.mainPath, `${resolvedRemote}/${mainBranch}`);
          
          stepSuccess(`Fetched ${resolvedRemote}/${mainBranch}`, `${commit.hash} "${commit.subject}"`);
          successCount++;
        } catch (err: any) {
          stepError("Failed to fetch", err.message);
        }
      }
      
      summary(`Done — ${successCount} repos fetched`);
    });
}
