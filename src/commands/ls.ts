import { Command } from "commander";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import { repoHeader, indented, stepWarning, info, error } from "../lib/log.js";
import { getWorktreeList, getDirtyFiles } from "../lib/git.js";
import { resolveRepos, parseRepoFlag , warnIfNoRepos } from "../lib/resolver.js";
import { resolveForge } from "../lib/forge/index.js";
import { derivePrDisplay, type PrInfo } from "../lib/forge/types.js";
import { renderDisplayState } from "../lib/forge/render.js";
import { resolveOwnership, type Ownership } from "../lib/owner.js";
import chalk from "chalk";
import path from "path";
import fs from "fs";

interface LsOptions {
  repo?: string[];
  pr?: boolean;
  json?: boolean;
}

export interface LsJsonInputRepo {
  name: string;
  mainPath: string;
  worktrees: Array<{
    path: string;
    branch: string | null;
    commit: string | null;
    isLocked: boolean;
    dirtyFiles?: string[];
    isMissing?: boolean;
    isError?: boolean;
  }>;
  prMap: Map<string, PrInfo> | null;
  ownerships: Map<string, Ownership | null>;
}

export function buildLsJson(reposData: LsJsonInputRepo[]) {
  const result: Record<string, unknown>[] = [];
  for (const repo of reposData) {
    for (const wt of repo.worktrees) {
      const branch = wt.branch || path.basename(wt.path);
      const sha = (wt.commit || "0000000").substring(0, 7);
      
      let status: string | { dirty: number } = "clean";
      
      if (wt.path === repo.mainPath) {
        status = "main";
      } else if (wt.isLocked) {
        status = "locked";
      } else if (wt.isMissing) {
        status = "missing";
      } else if (wt.isError) {
        status = "error";
      } else if (wt.dirtyFiles && wt.dirtyFiles.length > 0) {
        status = { dirty: wt.dirtyFiles.length };
      }

      const prInfo = repo.prMap?.get(branch);
      let pr = undefined;
      if (prInfo) {
        pr = { number: prInfo.number, state: prInfo.state };
      }

      let ownerStr = null;
      if (wt.path !== repo.mainPath) {
        const ownership = repo.ownerships.get(branch);
        if (ownership && !ownership.mine && ownership.author) {
          ownerStr = ownership.author;
        }
      }

      const entry: Record<string, unknown> = { repo: repo.name, branch, sha, status };
      if (pr) entry.pr = pr;
      if (ownerStr) entry.owner = ownerStr;
      
      result.push(entry);
    }
  }
  return result;
}

async function fetchPrMap(
  repo: ReturnType<typeof resolveRepos>[number],
  branches: string[],
  verboseFlag: boolean
): Promise<Map<string, PrInfo> | null> {
  const forge = resolveForge(repo);
  if (!forge) return null;
  return forge.findForBranches({ cwd: repo.mainPath, branches, verbose: verboseFlag });
}

export function registerLsCommand(program: Command) {
  program
    .command("ls")
    .description("List worktrees with status")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--pr", "Include pull request status column")
    .option("--json", "Output machine-readable JSON")
    .action(async (options: LsOptions) => {
      try {
        const globalOpts = program.opts<GlobalOptions>();
        const config = loadConfig();
        const repoFilter = parseRepoFlag(options.repo);
        const repos = resolveRepos(config, repoFilter);
        if (!options.json) {
          warnIfNoRepos(repos, { quiet: globalOpts.quiet });
        }
        const jsonRepos: LsJsonInputRepo[] = [];

        for (const repo of repos) {
          if (!options.json) repoHeader(repo.name);
          
          const jsonRepo: LsJsonInputRepo = {
            name: repo.name,
            mainPath: repo.mainPath,
            worktrees: [],
            prMap: null,
            ownerships: new Map(),
          };

          try {
            const worktrees = await getWorktreeList(repo.mainPath);
            const maxBranchLen = Math.max(
              ...worktrees.map((wt) => (wt.branch || "main").length)
            );

            let prMap: Map<string, PrInfo> | null = null;
            if (options.pr) {
              const branches = worktrees
                .filter((wt) => wt.path !== repo.mainPath && wt.branch)
                .map((wt) => wt.branch);
              if (branches.length > 0) {
                try {
                  prMap = await fetchPrMap(repo, branches, globalOpts.verbose);
                  jsonRepo.prMap = prMap;
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  if (!options.json) stepWarning("PR lookup failed", message);
                }
              }
            }

            for (const wt of worktrees) {
              const branch = wt.branch || path.basename(wt.path);
              const paddedBranch = branch.padEnd(maxBranchLen + 2);
              const hash = (wt.commit || "0000000").substring(0, 7);

              let statusStr = chalk.dim("clean");
              let isMissing = false;
              let isError = false;
              let dirtyFiles: string[] = [];

              if (wt.path === repo.mainPath) {
                statusStr = chalk.blue("[main checkout]");
              } else if (wt.isLocked) {
                statusStr = chalk.red("locked 🔒");
              } else if (fs.existsSync(wt.path)) {
                try {
                  dirtyFiles = await getDirtyFiles(wt.path);
                  if (dirtyFiles.length > 0) {
                    statusStr = chalk.yellow(`dirty (${dirtyFiles.length} files)`);
                  }
                } catch (e) {
                  isError = true;
                  statusStr = chalk.red("error");
                }
              } else {
                isMissing = true;
                statusStr = chalk.red("missing");
              }

              let prSegment = "";
              const prInfo = prMap?.get(branch);
              if (prInfo) {
                const display = derivePrDisplay(prInfo);
                prSegment = `  #${prInfo.number} ${renderDisplayState(display)}  ${chalk.dim(prInfo.url)}`;
              }

              let ownerSuffix = "";
              let ownership: Ownership | null = null;
              if (wt.path !== repo.mainPath) {
                ownership = await resolveOwnership({
                  configUser: config.user,
                  mainPath: repo.mainPath,
                  branch,
                  wtPath: wt.path,
                  prAuthorLogin: prInfo?.authorLogin ?? null,
                  verbose: globalOpts.verbose,
                });
                jsonRepo.ownerships.set(branch, ownership);
                
                if (ownership && !ownership.mine && ownership.author) {
                  ownerSuffix = `  ${chalk.dim(ownership.author)}`;
                }
              }

              jsonRepo.worktrees.push({
                path: wt.path,
                branch: wt.branch,
                commit: wt.commit,
                isLocked: wt.isLocked,
                dirtyFiles,
                isMissing,
                isError,
              });

              if (!options.json) {
                info(`  ${paddedBranch} ${hash}  ${statusStr}${prSegment}${ownerSuffix}`);
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!options.json) indented(chalk.red(`Failed to list worktrees: ${msg}`));
          }
          if (options.json) {
            jsonRepos.push(jsonRepo);
          }
        }

        if (options.json) {
          console.log(JSON.stringify(buildLsJson(jsonRepos), null, 2));
        } else {
          info("");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (options.json) {
          console.error(JSON.stringify({ error: msg }));
          process.exit(1);
        } else {
          error(msg);
          process.exit(1);
        }
      }
    });
}
