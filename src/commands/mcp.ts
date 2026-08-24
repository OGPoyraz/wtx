import { Command } from "commander";
import { runMcpServer, type McpServerOptions } from "../lib/mcp/server.js";
import type { GlobalOptions } from "../types.js";

export function registerMcpCommand(program: Command) {
  program
    .command("mcp")
    .description("Run MCP server exposing worktree tools over stdio")
    .action(async (_options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const opts: McpServerOptions = {
        verbose: globalOpts.verbose,
      };
      await runMcpServer(opts);
    });
}
