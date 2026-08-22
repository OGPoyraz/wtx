import { Command } from "commander";
import type { GlobalOptions } from "../types.js";

export function registerTerminalCommand(program: Command) {
  program
    .command("terminal")
    .description("Interactive worktree dashboard (requires Bun)")
    .action(async () => {
      const opts = program.optsWithGlobals() as GlobalOptions;

      if (typeof Bun === "undefined") {
        process.stderr.write("✗ wtx terminal requires the Bun runtime\n");
        process.stderr.write("  Install bun: https://bun.sh\n");
        process.stderr.write("  Or run: bunx wtx terminal\n");
        process.exit(1);
      }

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        process.stderr.write("✗ wtx terminal requires an interactive terminal\n");
        process.exit(1);
      }

      const { runTerminal } = await import("../tui/index.js");
      await runTerminal(opts);
    });
}
