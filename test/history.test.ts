import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import {
  appendHistory,
  readRecentHistory,
  rotateHistory,
  getHistoryPath,
} from "../src/lib/history.js";
import type { HistoryEntry } from "../src/lib/history.js";
import { createTempDir } from "./setup.js";

describe("history", () => {
  const originalStateHome = process.env.XDG_STATE_HOME;
  let stateDir: string;

  beforeEach(() => {
    stateDir = createTempDir("wtx-history-");
    process.env.XDG_STATE_HOME = stateDir;
  });

  afterEach(() => {
    if (originalStateHome === undefined) {
      delete process.env.XDG_STATE_HOME;
    } else {
      process.env.XDG_STATE_HOME = originalStateHome;
    }
  });

  function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
    return {
      ts: "2026-08-24T10:00:00.000Z",
      source: "cli",
      command: "create",
      args: ["create", "feat/x"],
      durationMs: 100,
      exit: 0,
      ...overrides,
    };
  }

  it("creates the state directory and appends JSONL on first write", () => {
    appendHistory(makeEntry());

    const content = fs.readFileSync(getHistoryPath(), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ command: "create", source: "cli" });
  });

  it("round-trips entries through append and read", () => {
    appendHistory(makeEntry({ command: "remove" }));
    appendHistory(makeEntry({ command: "rebase" }));

    const entries = readRecentHistory();
    expect(entries.map((e) => e.command)).toEqual(["rebase", "remove"]);
  });

  it("returns newest first and respects limit", () => {
    for (let i = 0; i < 10; i++) {
      appendHistory(makeEntry({ command: `cmd-${i}` }));
    }

    const entries = readRecentHistory(3);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.command).toBe("cmd-9");
    expect(entries[2]?.command).toBe("cmd-7");
  });

  it("returns empty array when no history file exists", () => {
    expect(readRecentHistory()).toEqual([]);
  });

  it("skips malformed lines instead of failing", () => {
    appendHistory(makeEntry());
    fs.appendFileSync(getHistoryPath(), "{ not json\n", "utf-8");
    appendHistory(makeEntry({ command: "sync" }));

    const entries = readRecentHistory();
    expect(entries.map((e) => e.command)).toEqual(["sync", "create"]);
  });

  it("keeps only the newest keepLines entries on rotation", () => {
    for (let i = 0; i < 50; i++) {
      appendHistory(makeEntry({ command: `cmd-${i}` }));
    }

    rotateHistory(1, 10);

    const content = fs.readFileSync(getHistoryPath(), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    expect(lines).toHaveLength(10);
    const commands = lines.map((l) => JSON.parse(l).command);
    expect(commands).toEqual(Array.from({ length: 10 }, (_, i) => `cmd-${40 + i}`));
  });

  it("does nothing on rotation when file is under max bytes", () => {
    appendHistory(makeEntry());
    const before = fs.readFileSync(getHistoryPath(), "utf-8");

    rotateHistory(1024 * 1024);

    expect(fs.readFileSync(getHistoryPath(), "utf-8")).toBe(before);
  });
});
