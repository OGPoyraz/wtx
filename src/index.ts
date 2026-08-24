#!/usr/bin/env node

import { Command } from "commander";
import { VERSION } from "./types.js";
import type { GlobalOptions } from "./types.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerCreateCommand } from "./commands/create.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerPullBranchCommand } from "./commands/pull-branch.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerPruneCommand } from "./commands/prune.js";
import { registerLsCommand } from "./commands/ls.js";
import { registerInitCommand } from "./commands/init.js";
import { registerRebaseCommand } from "./commands/rebase.js";
import { registerFetchCommand } from "./commands/fetch.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerDepsCommand } from "./commands/deps.js";
import { registerOpenCommand } from "./commands/open.js";
import { registerRenameCommand } from "./commands/rename.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerPrsCommand } from "./commands/prs.js";
import { registerSkillCommand } from "./commands/skill.js";
import { registerTerminalCommand } from "./commands/terminal.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerHistoryCommand } from "./commands/history.js";
import { loadConfig } from "./lib/config.js";
import { getWorktreePath, resolveRepos } from "./lib/resolver.js";
import { setQuiet } from "./lib/log.js";
import { appendHistory } from "./lib/history.js";
import type { HistoryEntry, HistorySource } from "./lib/history.js";
import fs from "fs";

const program = new Command();

program
  .name("wtx")
  .description("Multi-repo git worktree manager")
  .version(VERSION)
  .option("-q, --quiet", "Suppress progress indicators", false)
  .option("--verbose", "Show git commands as they run", false)
  .option("--dry-run", "Show what would happen", false);

const MUTATING_COMMANDS = new Set([
  "create",
  "pull",
  "pull-branch",
  "remove",
  "prune",
  "rebase",
  "sync",
  "fetch",
  "open",
  "exec",
  "rename",
]);

const MUTATING_CONFIG_SUBCOMMANDS = new Set(["set", "add-repo", "remove-repo"]);

function shouldLogCommand(actionCmd: Command, opts: Record<string, unknown>): boolean {
  const name = actionCmd.name();
  if (MUTATING_COMMANDS.has(name)) {
    if (name === "deps") return Boolean(opts.install || opts.symlink);
    return true;
  }
  if (actionCmd.parent?.name() === "config" && MUTATING_CONFIG_SUBCOMMANDS.has(name)) {
    return true;
  }
  return false;
}

function currentSource(): HistorySource {
  return process.env.WTX_SOURCE === "terminal" ? "terminal" : "cli";
}

let pendingEntry: Omit<HistoryEntry, "durationMs" | "exit"> | null = null;
let pendingStartedAt = 0;
let exitFlushInstalled = false;

function ensureExitFlush(): void {
  if (exitFlushInstalled) return;
  exitFlushInstalled = true;
  process.on("exit", () => {
    if (!pendingEntry) return;
    appendHistory({ ...pendingEntry, durationMs: Date.now() - pendingStartedAt, exit: null });
    pendingEntry = null;
  });
}

function flushPending(exit: number | null): void {
  if (!pendingEntry) return;
  appendHistory({ ...pendingEntry, durationMs: Date.now() - pendingStartedAt, exit });
  pendingEntry = null;
}

program.hook("preAction", (_thisCommand, actionCommand) => {
  const globalOpts = program.opts<GlobalOptions>();
  if (globalOpts.quiet) {
    setQuiet(true);
  }

  const opts = actionCommand.opts() as Record<string, unknown>;
  if (!shouldLogCommand(actionCommand, opts)) return;

  ensureExitFlush();
  pendingStartedAt = Date.now();
  pendingEntry = {
    ts: new Date().toISOString(),
    source: currentSource(),
    command: actionCommand.name(),
    args: process.argv.slice(2),
  };
});

program.hook("postAction", () => {
  flushPending(0);
});

registerConfigCommand(program);
registerCreateCommand(program);
registerPullCommand(program);
registerPullBranchCommand(program);
registerRemoveCommand(program);
registerPruneCommand(program);
registerLsCommand(program);
registerInitCommand(program);
registerRebaseCommand(program);
registerFetchCommand(program);
registerSyncCommand(program);
registerDepsCommand(program);
registerOpenCommand(program);
registerRenameCommand(program);
registerStatusCommand(program);
registerPrsCommand(program);
registerSkillCommand(program);
registerTerminalCommand(program);
registerMcpCommand(program);
registerHistoryCommand(program);

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
