import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
  summaryWarning,
  indented,
} from "../lib/log.js";
import { gitExec, getDirtyFiles } from "../lib/git.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";

interface RemoveOptions {
  repo?: string[];
  force?: boolean;
}

export function registerRemoveCommand(program: Command) {
  program
    .command("remove <branch>")
    .description("Remove worktree(s)")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("-f, --force", "Force removal even if there are uncommitted changes")
    .action(async (branch: string, options: RemoveOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      
      const repos = resolveRepos(config, repoFilter);
      let successCount = 0;
      let skipCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        try {
          const wtPath = getWorktreePath(repo, branch);
          
          if (!fs.existsSync(wtPath) && !globalOpts.dryRun) {
            stepWarning("No worktree found", `${branch} (skipped)`);
            skipCount++;
            continue;
          }

          if (!options.force && !globalOpts.dryRun) {
            const dirtyFiles = await getDirtyFiles(wtPath);
            if (dirtyFiles.length > 0) {
              stepError("Worktree has uncommitted changes:");
              for (const file of dirtyFiles) {
                indented(file);
              }
              indented("Use --force to remove anyway");
              skipCount++;
              continue;
            }
          }

          const args = ["-C", repo.mainPath, "worktree", "remove", wtPath];
          if (options.force) {
            args.push("--force");
          }
          
          await gitExec(args, globalOpts);
          stepSuccess("Worktree removed", wtPath);

          if (!globalOpts.dryRun) {
            let currentDir = path.dirname(wtPath);
            while (currentDir.startsWith(repo.wtRoot) && currentDir !== repo.wtRoot) {
              try {
                if (fs.readdirSync(currentDir).length === 0) {
                  fs.rmdirSync(currentDir);
                  stepSuccess("Cleaned up empty directory", path.relative(repo.wtRoot, currentDir) + "/");
                } else {
                  break;
                }
              } catch (err) {
                break;
              }
              currentDir = path.dirname(currentDir);
            }
          }

          successCount++;
        } catch (err: any) {
          stepError("Failed to remove worktree", err.message);
        }
      }

      if (successCount === 0 && skipCount === 0) {
        summaryWarning("No worktrees removed");
      } else if (skipCount > 0) {
        summaryWarning(`Done — ${successCount} removed, ${skipCount} skipped`);
      } else {
        summary(`Done — ${successCount} worktrees removed`);
      }
    });
}
