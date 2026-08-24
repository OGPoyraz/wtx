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
import { resolveRepos,
  resolveMainBranch,
  parseRepoFlag, warnIfNoRepos } from "../lib/resolver.js";
import { Semaphore } from "../lib/semaphore.js";

interface FetchOptions {
  repo?: string[];
}

type FetchResult =
  | { repoName: string; message: string; detail: string }
  | { repoName: string; error: string };

const FETCH_CONCURRENCY = 4;

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
        warnIfNoRepos(repos, { quiet: opts.quiet });

      const semaphore = new Semaphore(FETCH_CONCURRENCY);

      const results: FetchResult[] = await Promise.all(
        repos.map(async (repo): Promise<FetchResult> => {
          await semaphore.acquire();
          try {
            const mainBranch = await resolveMainBranch(repo, config);
            const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
            await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, mainBranch], opts);
            const commit = await getLatestCommit(repo.mainPath, `${resolvedRemote}/${mainBranch}`);
            return {
              repoName: repo.name,
              message: `Fetched ${resolvedRemote}/${mainBranch}`,
              detail: `${commit.hash} "${commit.subject}"`,
            };
          } catch (err: any) {
            return { repoName: repo.name, error: err.message };
          } finally {
            semaphore.release();
          }
        })
      );

      for (const result of results) {
        repoHeader(result.repoName);
        if ("error" in result) {
          stepError("Failed to fetch", result.error);
        } else {
          stepSuccess(result.message, result.detail);
        }
      }

      const successCount = results.filter((r) => !("error" in r)).length;
      summary(`Done — ${successCount} repos fetched`);
    });
}
