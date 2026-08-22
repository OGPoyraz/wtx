import { Command } from "commander";
import fs from "fs";
import path from "path";
import { execa } from "execa";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepProgress,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
  summaryWarning,
  verbose,
} from "../lib/log.js";
import { gitExec, branchExistsOnRemote } from "../lib/git.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { expandTemplate, type TemplateVars } from "../lib/template.js";
import { resolveIde, spawnIde } from "../lib/ide.js";

interface CreateOptions {
  repo?: string[];
  base?: string;
  open?: boolean;
  ide?: string;
}

export function registerCreateCommand(program: Command) {
  program
    .command("create <branch>")
    .description("Create worktree(s)")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--base <ref>", "Base ref to create branch from")
    .option("-o, --open", "Open worktree(s) in IDE after creation")
    .option("--ide <editor>", "IDE to open with (used with --open)")
    .action(async (branch: string, options: CreateOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);

      const ide = options.open ? resolveIde(options.ide, config) : undefined;
      if (options.open && !ide) {
        stepWarning("No IDE configured", "Set via --ide, config, or $EDITOR");
      }

      const openWorktree = (wtPath: string) => {
        if (!ide) return;

        if (globalOpts.dryRun) {
          stepWarning(`Would open in ${ide}`, wtPath);
          return;
        }

        spawnIde(ide, wtPath);
        stepSuccess(`Opened in ${ide}`, wtPath);
      };

      const repos = resolveRepos(config, repoFilter);
      let successCount = 0;
      let skipCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        try {
          const wtPath = getWorktreePath(repo, branch);
          
          if (fs.existsSync(wtPath)) {
            stepWarning("Worktree already exists", `${wtPath} (skipped)`);
            skipCount++;
            openWorktree(wtPath);
            continue;
          }

          if (!globalOpts.dryRun) {
            fs.mkdirSync(path.dirname(wtPath), { recursive: true });
          }

          stepProgress("Checking remote branch...");
          const mainBranch = await resolveMainBranch(repo, config);
          const baseRef = options.base || `origin/${mainBranch}`;
          
          const remoteExists = await branchExistsOnRemote(repo.mainPath, branch, globalOpts);
          
          if (remoteExists) {
            verbose(`Remote branch found on origin, tracking`, globalOpts.verbose);
            try {
              await gitExec(["-C", repo.mainPath, "worktree", "add", "--track", "-b", branch, wtPath, `origin/${branch}`], globalOpts);
            } catch (err) {
              verbose(`Tracking failed, assuming local branch exists. Falling back to local branch...`, globalOpts.verbose);
              await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
            }
          } else {
            verbose(`Remote branch not found, creating from ${baseRef}`, globalOpts.verbose);
            await gitExec(["-C", repo.mainPath, "worktree", "add", "-b", branch, wtPath, baseRef], globalOpts);
          }
          
          stepSuccess("Worktree created", wtPath);

          if (repo.config.sync_files && repo.config.sync_files.length > 0) {
            for (const file of repo.config.sync_files) {
              const src = path.join(repo.mainPath, file);
              const dest = path.join(wtPath, file);
              
              if (fs.existsSync(src)) {
                if (!globalOpts.dryRun) {
                  fs.copyFileSync(src, dest);
                }
                stepSuccess(`Synced ${file}`);
              } else {
                stepWarning(`Could not sync ${file}`, "file not found in main checkout");
              }
            }
          }

          if (repo.config.post_create && repo.config.post_create.length > 0) {
            const tplVars: TemplateVars = {
              root: config.root,
              repo: repo.name,
              branch,
              main: repo.mainPath,
              wt: wtPath,
              postfix: config.postfix,
            };

            for (const cmd of repo.config.post_create) {
              const expandedCmd = expandTemplate(cmd, tplVars);
              stepProgress(`Running post-create: ${expandedCmd.split(" ")[0]}...`);
              
              if (!globalOpts.dryRun) {
                try {
                  await execa(expandedCmd, { shell: true, cwd: wtPath });
                  stepSuccess(`Command succeeded`, expandedCmd);
                } catch (err: any) {
                  stepWarning(`Command failed`, err.message);
                }
              }
            }
            stepSuccess("Post-create complete");
          }

          openWorktree(wtPath);

          successCount++;
        } catch (err: any) {
          stepError("Failed to create worktree", err.message);
        }
      }

      if (successCount === 0 && skipCount === 0) {
        summaryWarning("No worktrees created");
      } else if (skipCount > 0) {
        summaryWarning(`Done — ${successCount} created, ${skipCount} skipped`);
      } else {
        summary(`Done — ${successCount} worktrees created`);
      }
    });
}
