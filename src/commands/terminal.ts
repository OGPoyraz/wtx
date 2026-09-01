import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type { GlobalOptions } from "../types.js";

function findEntry(): string | null {
  const candidates: string[] = [];

  if (process.argv[1]) candidates.push(process.argv[1]);

  try {
    const thisPath = fileURLToPath(import.meta.url);
    candidates.push(thisPath);
    candidates.push(path.resolve(path.dirname(thisPath), "../../dist/cli.mjs"));
    candidates.push(path.resolve(path.dirname(thisPath), "../cli.mjs"));
  } catch {}

  for (const p of candidates) {
    try {
      if (p.endsWith(".mjs") || p.endsWith(".js")) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } else if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isFile()) {
          const head = fs.readFileSync(p, "utf8").slice(0, 1024);
          if (head.includes("cli.mjs") || head.includes("#!/usr/bin/env node")) {
            if (p.endsWith("wtx") || p.endsWith("cli.mjs")) {
              const dir = path.dirname(fs.realpathSync(p));
              const cli = path.join(dir, "cli.mjs");
              if (fs.existsSync(cli)) return cli;
              const cli2 = path.resolve(dir, "../dist/cli.mjs");
              if (fs.existsSync(cli2)) return cli2;
              if (head.includes("import") || head.includes("commander")) return p;
            }
          }
        }
      }
    } catch {}
  }

  try {
    const thisPath = fileURLToPath(import.meta.url);
    const pkgRoot = path.resolve(path.dirname(thisPath), "../..");
    const cli = path.join(pkgRoot, "dist", "cli.mjs");
    if (fs.existsSync(cli)) return cli;
  } catch {}

  return null;
}

function tryRelaunchViaBun(forwardedArgs: string[]): never | null {
  if (process.env.WTX_BUN_RERUN === "1") return null;

  const env = { ...process.env, WTX_BUN_RERUN: "1" } as NodeJS.ProcessEnv;
  const entry = findEntry();

  if (entry) {
    const result = spawnSync("bun", [entry, ...forwardedArgs], {
      stdio: "inherit",
      env,
    });
    if (!result.error) {
      process.exit(result.status ?? 0);
    }
    if ((result.error as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(`✗ Failed to relaunch via Bun: ${result.error.message}\n`);
      process.exit(1);
    }
  }

  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: "bunx", args: ["--bun", "wtx", ...forwardedArgs] },
    { cmd: "bun", args: ["x", "--bun", "wtx", ...forwardedArgs] },
  ];

  for (const { cmd, args } of attempts) {
    const result = spawnSync(cmd, args, { stdio: "inherit", env });
    if (!result.error) {
      process.exit(result.status ?? 0);
    }
    if ((result.error as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(`✗ Failed to relaunch via ${cmd}: ${result.error.message}\n`);
      process.exit(1);
    }
  }

  return null;
}

export function registerTerminalCommand(program: Command) {
  program
    .command("terminal")
    .description("Interactive worktree dashboard (requires Bun)")
    .action(async () => {
      const opts = program.optsWithGlobals() as GlobalOptions;

      if (typeof Bun === "undefined") {
        const forwarded = process.argv.slice(2);
        const relaunched = tryRelaunchViaBun(forwarded);
        if (relaunched === null) {
          const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });
          const hasBun = !probe.error && probe.status === 0;
          if (!hasBun) {
            process.stderr.write("✗ wtx terminal dashboard requires the Bun runtime\n");
            process.stderr.write("  The TUI relies on Bun's FFI and React renderer which cannot run in Node/compiled binary.\n");
            process.stderr.write("  Bun was not found on your PATH. Install it from https://bun.sh, then run:\n");
            process.stderr.write("    wtx terminal\n\n");
            process.stderr.write("  Note: `wtx ls` provides a fast list view and works everywhere.\n");
            process.exit(1);
          }
          process.stderr.write("✗ wtx terminal dashboard requires the Bun runtime\n");
          process.stderr.write("  The TUI relies on Bun's FFI and React renderer which cannot run in Node/compiled binary.\n");
          process.stderr.write("  Automatic relaunch via Bun failed. Try running directly:\n");
          process.stderr.write("    bunx --bun wtx terminal\n");
          const entry = findEntry();
          if (entry) {
            process.stderr.write(`    bun ${entry} terminal\n`);
          }
          process.stderr.write("\n  Note: `wtx ls` provides a fast list view and works everywhere.\n");
          process.exit(1);
        }
        return;
      }

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        process.stderr.write("✗ wtx terminal requires an interactive terminal\n");
        process.exit(1);
      }

      process.env.RUST_LOG ??= "off";
      process.env.ZIG_LOG ??= "off";
      process.env.PAGE_LIST_LOG ??= "off";
      process.env.OPENTUI_LOG ??= "off";
      const { runTerminal } = await import("../tui/index.js");
      await runTerminal(opts);
    });
}
