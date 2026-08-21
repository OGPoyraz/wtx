import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { repoHeader, indented } from "../lib/log.js";
import { getWorktreeList, getDirtyFiles } from "../lib/git.js";
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import chalk from "chalk";
import path from "path";
import fs from "fs";

interface LsOptions {
  repo?: string[];
}

export function registerLsCommand(program: Command) {
  program
    .command("ls")
    .description("List worktrees with status")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .action(async (options: LsOptions) => {
      try {
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
              
              console.log(`  ${paddedBranch} ${hash}  ${status}`);
            }
          } catch (err: any) {
             indented(chalk.red(`Failed to list worktrees: ${err.message}`));
          }
        }
      } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}
