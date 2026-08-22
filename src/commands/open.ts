import { Command } from "commander";
import fs from "fs";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
} from "../lib/log.js";
import { resolveRepos, getWorktreePath, parseRepoFlag } from "../lib/resolver.js";
import { resolveIde, spawnIde } from "../lib/ide.js";

interface OpenOptions {
  repo?: string[];
  ide?: string;
}

export function registerOpenCommand(program: Command) {
  program
    .command("open <branch>")
    .description("Open worktree(s) in IDE")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--ide <editor>", "IDE to open with")
    .action(async (branch: string, options: OpenOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);

      const ide = resolveIde(options.ide, config);
      if (!ide) {
        stepError("No IDE configured", "Set via --ide, config, or $EDITOR");
        process.exit(1);
      }

      let openCount = 0;

      for (const repo of repos) {
        const wtPath = getWorktreePath(repo, branch);
        if (!fs.existsSync(wtPath)) {
          continue;
        }

        repoHeader(repo.name);

        if (globalOpts.dryRun) {
          stepSuccess(`Would open in ${ide}`, wtPath);
          openCount++;
          continue;
        }

        spawnIde(ide, wtPath);
        stepSuccess(`Opened in ${ide}`, wtPath);
        openCount++;
      }

      if (openCount === 0) {
        stepWarning("No worktrees found for this branch");
      } else {
        summary(`Done — ${openCount} worktree${openCount > 1 ? "s" : ""} opened in ${ide}`);
      }
    });
}
