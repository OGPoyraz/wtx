import { Command } from "commander";
import type { GlobalOptions } from "../types.js";

export function registerTerminalCommand(program: Command) {
  program
    .command("terminal")
    .description("Interactive worktree dashboard (requires Bun)")
    .action(async () => {
      const opts = program.optsWithGlobals() as GlobalOptions;

      if (typeof Bun === "undefined") {
        process.stderr.write("✗ wtx terminal dashboard requires the Bun runtime\n");
        process.stderr.write("  The TUI relies on Bun's FFI and React renderer which cannot run in Node/compiled binary.\n");
        process.stderr.write("  To use the dashboard, run it via Bun:\n");
        process.stderr.write("    bunx wtx terminal\n\n");
        process.stderr.write("  Note: `wtx ls` provides a fast list view and works everywhere.\n");
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
