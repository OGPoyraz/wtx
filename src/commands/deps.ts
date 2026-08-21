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
}

export function registerDepsCommand(program: Command) {
  program
    .command("deps [branch]")
    .description("Manage node_modules strategy per worktree")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--install", "Switch to independent node_modules (run install)")
    .option("--symlink", "Switch to symlinked node_modules")
    .action(async (branch: string | undefined, options: DepsOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);

      for (const repo of repos) {
        repoHeader(repo.name);

        if (!branch) {
          const state = detectDepsState(repo.mainPath, repo.mainPath);
          info(`  Main repo package manager: ${state.packageManager ?? "none detected"}`);
          continue;
        }

        const wtPath = getWorktreePath(repo, branch);
        if (!fs.existsSync(wtPath)) {
          stepWarning("No worktree found", `${branch} (skipped)`);
          continue;
        }

        if (options.install) {
          await switchToInstall(wtPath, globalOpts);
        } else if (options.symlink) {
          await switchToSymlink(wtPath, repo.mainPath, globalOpts);
        } else {
          const state = detectDepsState(wtPath, repo.mainPath);
          const strategyLabel = state.strategy === "symlinked"
            ? `symlinked → ${state.symlinkTarget}`
            : state.strategy;
          const lockLabel = state.lockfileMatch ? "matches main" : "differs from main";
          info(`  node_modules: ${strategyLabel}`);
          info(`  ${state.packageManager ?? "no"} lockfile: ${lockLabel}`);
        }
      }

      summary("Done");
    });
}
