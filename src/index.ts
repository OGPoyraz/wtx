#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./types.js";
import type { GlobalOptions } from "./types.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerCreateCommand } from "./commands/create.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerPruneCommand } from "./commands/prune.js";
import { registerLsCommand } from "./commands/ls.js";
import { registerInitCommand } from "./commands/init.js";
import { registerRebaseCommand } from "./commands/rebase.js";
import { registerFetchCommand } from "./commands/fetch.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerDepsCommand } from "./commands/deps.js";
import { registerOpenCommand } from "./commands/open.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerPrsCommand } from "./commands/prs.js";
import { registerSkillCommand } from "./commands/skill.js";
import { registerTerminalCommand } from "./commands/terminal.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { loadConfig } from "./lib/config.js";
import { getWorktreePath, resolveRepos } from "./lib/resolver.js";
import { setQuiet } from "./lib/log.js";
import fs from "fs";

const program = new Command();

program
  .name("wtx")
  .description("Multi-repo git worktree manager")
  .version(VERSION)
  .option("-q, --quiet", "Suppress progress indicators", false)
  .option("--verbose", "Show git commands as they run", false)
  .option("--dry-run", "Show what would happen", false);

program.hook("preAction", () => {
  const globalOpts = program.opts<GlobalOptions>();
  if (globalOpts.quiet) {
    setQuiet(true);
  }
});

registerConfigCommand(program);
registerCreateCommand(program);
registerPullCommand(program);
registerRemoveCommand(program);
registerPruneCommand(program);
registerLsCommand(program);
registerInitCommand(program);
registerRebaseCommand(program);
registerFetchCommand(program);
registerSyncCommand(program);
registerDepsCommand(program);
registerOpenCommand(program);
registerStatusCommand(program);
registerPrsCommand(program);
registerSkillCommand(program);
registerTerminalCommand(program);
registerMcpCommand(program);

program
  .command("_resolve-path <repo> <branch>", { hidden: true })
  .description("Internal command to resolve worktree path for shell wrapper cd")
  .action((repoName: string, branch: string) => {
    try {
      const config = loadConfig();
      const repos = resolveRepos(config, [repoName]);
      if (repos.length === 0) {
        process.stderr.write(`✗ Repo '${repoName}' not found in config\n`);
        process.exit(1);
      }

      const repo = repos[0]!;
      const wtPath = getWorktreePath(repo, branch);

      if (!fs.existsSync(wtPath)) {
        process.stderr.write(`✗ No worktree at ${wtPath}\n`);
        process.exit(1);
      }

      process.stdout.write(wtPath);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program.parse();
