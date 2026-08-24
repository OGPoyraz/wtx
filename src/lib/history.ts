import fs from "fs";
import path from "path";
import os from "os";

export type HistorySource = "cli" | "terminal";

export interface HistoryEntry {
  ts: string;
  source: HistorySource;
  command: string;
  args: string[];
  durationMs: number | null;
  exit: number | null;
}

export const HISTORY_MAX_BYTES = 5 * 1024 * 1024;
export const HISTORY_ROTATE_KEEP_LINES = 1000;

export function getHistoryDir(): string {
  const stateHome = process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "wtx");
}

export function getHistoryPath(): string {
  return path.join(getHistoryDir(), "history.jsonl");
}

export function rotateHistory(maxBytes: number = HISTORY_MAX_BYTES, keepLines: number = HISTORY_ROTATE_KEEP_LINES): void {
  const historyPath = getHistoryPath();

  let size = 0;
  try {
    size = fs.statSync(historyPath).size;
  } catch {
    return;
  }
  if (size <= maxBytes) return;

  const lines = fs.readFileSync(historyPath, "utf-8").split("\n").filter(Boolean);
  const kept = lines.slice(-keepLines);
  const tmpPath = `${historyPath}.tmp.${process.pid}`;

  try {
    fs.writeFileSync(tmpPath, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf-8");
    fs.renameSync(tmpPath, historyPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw err;
  }
}

export function appendHistory(entry: HistoryEntry): void {
  try {
    const dir = getHistoryDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    rotateHistory();
    fs.appendFileSync(getHistoryPath(), `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // history is best-effort: never let logging break command execution
  }
}

export function readRecentHistory(limit = 50): HistoryEntry[] {
  let content: string;
  try {
    content = fs.readFileSync(getHistoryPath(), "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n").filter(Boolean);
  const entries: HistoryEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      entries.push(JSON.parse(lines[i]!) as HistoryEntry);
    } catch {
      // skip malformed lines instead of failing the whole read
    }
  }
  return entries;
}
