import { Command } from "commander";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import { repoHeader, indented, stepWarning } from "../lib/log.js";
import { getWorktreeList, getDirtyFiles } from "../lib/git.js";
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import { resolveForge } from "../lib/forge/index.js";
import { derivePrDisplay, type PrInfo } from "../lib/forge/types.js";
import { renderDisplayState } from "../lib/forge/render.js";
import { resolveOwnership } from "../lib/owner.js";
import chalk from "chalk";
import path from "path";
import fs from "fs";

interface LsOptions {
  repo?: string[];
  pr?: boolean;
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
    .action(async (options: LsOptions) => {
      try {
        const globalOpts = program.opts<GlobalOptions>();
        const config = loadConfig();
        const repoFilter = parseRepoFlag(options.repo);
        const repos = resolveRepos(config, repoFilter);

        for (const repo of repos) {
          repoHeader(repo.name);

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
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  stepWarning("PR lookup failed", message);
                }
              }
            }

            for (const wt of worktrees) {
              const branch = wt.branch || path.basename(wt.path);
              const paddedBranch = branch.padEnd(maxBranchLen + 2);
              const hash = (wt.commit || "0000000").substring(0, 7);

              let status = chalk.dim("clean");

              if (wt.path === repo.mainPath) {
                status = chalk.blue("[main checkout]");
              } else if (wt.isLocked) {
                status = chalk.red("locked 🔒");
              } else if (fs.existsSync(wt.path)) {
                try {
                  const dirtyFiles = await getDirtyFiles(wt.path);
                  if (dirtyFiles.length > 0) {
                    status = chalk.yellow(`dirty (${dirtyFiles.length} files)`);
                  }
                } catch (e) {
                  status = chalk.red("error");
                }
              } else {
                status = chalk.red("missing");
              }

              let prSegment = "";
              const prInfo = prMap?.get(branch);
              if (prInfo) {
                const display = derivePrDisplay(prInfo);
                prSegment = `  #${prInfo.number} ${renderDisplayState(display)}  ${chalk.dim(prInfo.url)}`;
              }

              let ownerSuffix = "";
              if (wt.path !== repo.mainPath) {
                const ownership = await resolveOwnership({
                  configUser: config.user,
                  mainPath: repo.mainPath,
                  branch,
                  wtPath: wt.path,
                  prAuthorLogin: prInfo?.authorLogin ?? null,
                  verbose: globalOpts.verbose,
                });
                if (ownership && !ownership.mine && ownership.author) {
                  ownerSuffix = `  ${chalk.dim(ownership.author)}`;
                }
              }

              console.log(`  ${paddedBranch} ${hash}  ${status}${prSegment}${ownerSuffix}`);
            }
            } catch (err: any) {
              indented(chalk.red(`Failed to list worktrees: ${err.message}`));
            }

        }

        console.log("");
      } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}
