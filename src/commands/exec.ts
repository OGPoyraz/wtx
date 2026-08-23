import { Command } from "commander";
import { execa } from "execa";
import { loadConfig } from "../lib/config.js";
import { resolveRepos, getWorktreePath, parseRepoFlag } from "../lib/resolver.js";
import { stepError, stepSuccess } from "../lib/log.js";
import { getWorktreePort } from "../lib/ports.js";
import fs from "fs";

interface ExecOptions {
  repo?: string[];
}

export function registerExecCommand(program: Command) {
  program
    .command("exec <branch> <command...>")
    .description("Run a command inside a worktree directory")
    .option("-r, --repo <repos...>", "Target specific repo")
    .action(async (branch: string, commandArgs: string[], options: ExecOptions) => {
      const config = loadConfig();
      const repos = resolveRepos(config, parseRepoFlag(options.repo));

      if (repos.length === 0) {
        stepError("No repo matched", "Check 'wtx config show' or pass --repo <name>");
        process.exit(1);
      }

      const repo = repos[0]!;
      const wtPath = getWorktreePath(repo, branch);

      if (!fs.existsSync(wtPath)) {
        stepError(`No worktree at ${wtPath}`, `Create it with 'wtx create ${branch} --repo ${repo.name}'`);
        process.exit(1);
      }

      const port = await getWorktreePort(repo.name, branch, config);
      const env = { ...process.env, WTX_PORT: String(port) };

      await execa(commandArgs.join(" "), {
        shell: true,
        cwd: wtPath,
        env,
        stdio: "inherit",
      });
      stepSuccess("Command finished", commandArgs.join(" "));
    });
}
