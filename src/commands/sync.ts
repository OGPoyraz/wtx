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
  indented,
} from "../lib/log.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { expandTemplate, type TemplateVars } from "../lib/template.js";
import { getWorktreePort } from "../lib/ports.js";

interface SyncOptions {
  repo?: string[];
}

export function registerSyncCommand(program: Command) {
  program
    .command("sync <branch>")
    .description("re-copy sync files + run post_sync")
    .option("--repo <repos...>", "comma-separated list of repos to target")
    .action(async (branch: string, _options: SyncOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as GlobalOptions & SyncOptions;
      
      const config = loadConfig();
      const targetRepos = parseRepoFlag(opts.repo);
      const repos = resolveRepos(config, targetRepos);
      
      let successCount = 0;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        const wtPath = getWorktreePath(repo, branch);
        if (!fs.existsSync(wtPath)) {
          stepWarning("No worktree found", `${wtPath} (skipped)`);
          continue;
        }

        try {
          if (repo.config.sync_files) {
            for (const file of repo.config.sync_files) {
              const src = path.join(repo.mainPath, file);
              const dest = path.join(wtPath, file);
              if (fs.existsSync(src)) {
                if (!opts.dryRun) {
                  fs.mkdirSync(path.dirname(dest), { recursive: true });
                  fs.copyFileSync(src, dest);
                }
                stepSuccess(`Synced ${file}`);
              }
            }
          }

          const hooks = repo.config.post_sync || repo.config.post_create || [];
          let hasWarn = false;

          if (hooks.length > 0) {
            const port = await getWorktreePort(repo.name, branch, config);
            const env = { ...process.env, WTX_PORT: String(port) };

            const tplVars: TemplateVars = {
              root: config.root,
              repo: repo.name,
              branch,
              main: repo.mainPath,
              wt: wtPath,
              postfix: config.postfix,
              port,
            };

            const hookResults: { command: string; ok: boolean; exitCode: number | null }[] = [];

            for (const hook of hooks) {
              const expandedCmd = expandTemplate(hook, tplVars);
              stepProgress(`Running post-sync: ${expandedCmd.split(" ")[0]}...`);
              
              if (!opts.dryRun) {
                try {
                  const result = await execa(expandedCmd, { shell: true, cwd: wtPath, env, reject: false });
                  if (result.exitCode === 0) {
                    stepSuccess(`Command succeeded`, expandedCmd);
                    hookResults.push({ command: expandedCmd, ok: true, exitCode: 0 });
                  } else {
                    stepWarning(`Command failed`, result.stderr || result.message || `exit code ${result.exitCode}`);
                    hookResults.push({ command: expandedCmd, ok: false, exitCode: result.exitCode ?? null });
                  }
                } catch (err: any) {
                  stepWarning(`Command failed`, err.message);
                  hookResults.push({ command: expandedCmd, ok: false, exitCode: err.exitCode ?? null });
                }
              }
            }

            const failedHooks = hookResults.filter(h => !h.ok);
            if (failedHooks.length > 0) {
              stepError("Sync failed", "One or more post-sync hooks failed");
              for (const failed of failedHooks) {
                indented(`- ${failed.command}`);
              }
              indented(`Re-run via: wtx sync ${branch}`);
              process.exit(1);
            }
          }

          const wtNodeModules = path.join(wtPath, "node_modules");
          if (fs.existsSync(wtNodeModules) && fs.lstatSync(wtNodeModules).isSymbolicLink()) {
            const lockfiles = ["yarn.lock", "package-lock.json", "pnpm-lock.yaml", "bun.lockb", "bun.lock"];
            for (const lock of lockfiles) {
              const mainLock = path.join(repo.mainPath, lock);
              const wtLock = path.join(wtPath, lock);
              
              if (fs.existsSync(mainLock) && fs.existsSync(wtLock)) {
                const mainContent = fs.readFileSync(mainLock);
                const wtContent = fs.readFileSync(wtLock);
                if (!mainContent.equals(wtContent)) {
                  stepWarning(`${lock} differs from main — node_modules is symlinked`);
                  indented(`Run: wtx deps ${branch} --repo ${repo.name} --install`);
                  hasWarn = true;
                  break;
                }
              }
            }
          }
          
          if (hasWarn) {
            stepSuccess("Sync complete (with warning)");
          } else {
            stepSuccess("Sync complete");
          }
          successCount++;
        } catch (err: any) {
          stepError("Failed to sync", err.message);
        }
      }
      
      summary(`Done — ${successCount} repos synced`);
    });
}
