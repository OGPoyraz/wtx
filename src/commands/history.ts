import { Command } from "commander";
import chalk from "chalk";
import { getHistoryPath, readRecentHistory } from "../lib/history.js";
import type { HistoryEntry } from "../lib/history.js";
import { error } from "../lib/log.js";

interface HistoryOptions {
  limit?: string;
  json?: boolean;
  source?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusMark(entry: HistoryEntry): { mark: string; colorize: (s: string) => string } {
  if (entry.exit === null || entry.exit === undefined) {
    return { mark: "◌", colorize: (s) => s };
  }
  if (entry.exit === 0) {
    return { mark: "✓", colorize: (s) => chalk.green(s) };
  }
  return { mark: "✗", colorize: (s) => chalk.red(s) };
}

function renderEntry(entry: HistoryEntry): string {
  const { mark, colorize } = statusMark(entry);
  const source = chalk.dim(entry.source.padEnd(8));
  const time = chalk.dim(formatTime(entry.ts));
  const args = entry.args.join(" ");
  let line = colorize(`${mark} ${time}  ${source}  ${args}`);
  if (entry.exit !== null && entry.exit !== undefined && entry.exit !== 0) {
    line += chalk.dim(` (exit ${entry.exit})`);
  } else if (entry.exit === null || entry.exit === undefined) {
    line += chalk.dim(" (incomplete)");
  }
  return line;
}

export function registerHistoryCommand(program: Command) {
  program
    .command("history")
    .description("Show recent action history")
    .option("--limit <n>", "Number of entries to show", "50")
    .option("--json", "Machine-readable output")
    .option("--source <source>", "Filter by source: cli | terminal")
    .action((options: HistoryOptions) => {

      const limit = Number.parseInt(options.limit ?? "50", 10);
      if (!Number.isInteger(limit) || limit <= 0) {
        error(`Invalid --limit value: ${options.limit}`);
        process.exit(1);
      }

      const source = options.source;
      if (source && source !== "cli" && source !== "terminal") {
        error(`Invalid --source value: ${source}. Use 'cli' or 'terminal'.`);
        process.exit(1);
      }

      let entries = readRecentHistory(limit);
      if (source) {
        entries = entries.filter((e) => e.source === source);
      }

      if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      if (entries.length === 0) {
        console.log(chalk.dim(`No history yet — actions are recorded to ${getHistoryPath()}`));
        return;
      }

      for (const entry of entries) {
        console.log(renderEntry(entry));
      }
    });
}
