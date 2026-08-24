import { Command } from "commander";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  info,
  stepWarning,
  summary,
} from "../lib/log.js";
import { resolveRepos, getWorktreePath, parseRepoFlag } from "../lib/resolver.js";
import {
  detectDepsState,
  switchToInstall,
  switchToSymlink,
} from "../lib/deps.js";
import fs from "fs";

interface DepsOptions {
  repo?: string[];
  install?: boolean;
  symlink?: boolean;
  json?: boolean;
}

export function registerDepsCommand(program: Command) {
  program
    .command("deps [branch]")
    .description("Manage node_modules strategy per worktree")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--install", "Switch to independent node_modules (run install)")
    .option("--symlink", "Switch to legacy symlinked node_modules")
    .option("--json", "Output machine-readable JSON state")
    .action(async (branch: string | undefined, options: DepsOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      // Override quiet for JSON output
      if (options.json) {
        globalOpts.quiet = true;
      }
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);

      const jsonResults: any = {};

      for (const repo of repos) {
        if (!options.json) repoHeader(repo.name);

        if (!branch) {
          const state = detectDepsState(repo.mainPath, repo.mainPath);
          if (options.json) {
            jsonResults[repo.name] = { main: state };
          } else {
            info(`  Main repo package manager: ${state.packageManager ?? "none detected"}`);
          }
          continue;
        }

        const wtPath = getWorktreePath(repo, branch);
        if (!fs.existsSync(wtPath)) {
          if (options.json) {
            jsonResults[repo.name] = { error: "No worktree found", branch };
          } else {
            stepWarning("No worktree found", `${branch} (skipped)`);
          }
          continue;
        }

        if (options.install) {
          const ok = await switchToInstall(wtPath, globalOpts);
          if (!ok) process.exitCode = 1;
          if (options.json) {
            jsonResults[repo.name] = detectDepsState(wtPath, repo.mainPath);
          }
        } else if (options.symlink) {
          await switchToSymlink(wtPath, repo.mainPath, globalOpts);
          if (options.json) {
            jsonResults[repo.name] = detectDepsState(wtPath, repo.mainPath);
          }
        } else {
          // check if repo config overrides
          // But wait, the command just displays state if no flags are passed.
          // Is there a case where `deps` without flags should auto-install based on config?
          // No, deps [branch] without flags just prints state according to current semantics.
          const state = detectDepsState(wtPath, repo.mainPath);
          
          if (options.json) {
            jsonResults[repo.name] = state;
            continue;
          }

          let strategyLabel: string = state.strategy;
          if (state.strategy === "symlinked") {
            strategyLabel = `symlinked → ${state.symlinkTarget}`;
          } else if (state.strategy === "broken") {
            strategyLabel = `broken symlink → ${state.symlinkTarget} (run 'wtx deps ${branch} --symlink' to repair)`;
          } else if (state.strategy === "external") {
            strategyLabel = `external symlink → ${state.symlinkTarget} resolves outside main checkout (run 'wtx deps ${branch} --symlink' to repair)`;
          } else if (state.strategy === "shared-target") {
            strategyLabel = "shared cargo target → build artifacts shared with main checkout";
          } else if (state.strategy === "linked-packages") {
            strategyLabel = `safely linked packages (auto/link)`;
          }
          
          if (state.repairHint) {
            strategyLabel += ` [Hint: ${state.repairHint}]`;
          }

          const lockLabel = state.lockfileMatch ? "matches main" : "differs from main";
          info(`  node_modules: ${strategyLabel}`);
          info(`  ${state.packageManager ?? "no"} lockfile: ${lockLabel}`);
        }
      }

      if (options.json) {
        console.log(JSON.stringify(jsonResults, null, 2));
      } else {
        summary("Done");
      }
    });
}
