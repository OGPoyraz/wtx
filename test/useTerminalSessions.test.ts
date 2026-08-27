import { describe, expect, it } from "vitest";
import { MAX_TERMINAL_SESSIONS, nextTerminalSessionLabel, relabelTerminalSessions, worktreeKeyFor, type TerminalSession } from "../src/tui/hooks/useTerminalSessions.js";

function session(id: string, label: string): TerminalSession {
  return {
    id,
    label,
    worktreeKey: "repo:branch",
    worktreePath: "/tmp/repo/branch",
    repoName: "repo",
    branch: "branch",
    lines: [],
    inputBuffer: "",
    exited: null,
    proc: null,
    terminal: null,
    cols: 80,
    rows: 24,
    usePty: false,
  };
}

describe("useTerminalSessions helpers", () => {
  it("builds stable worktree keys", () => {
    expect(worktreeKeyFor("repo", "branch", "/tmp/path")).toBe("/tmp/path");
    expect(worktreeKeyFor("repo", "branch", "")).toBe("repo:branch");
  });

  it("labels sessions sequentially", () => {
    expect(nextTerminalSessionLabel(0)).toBe("Session 1");
    expect(nextTerminalSessionLabel(4)).toBe("Session 5");
  });

  it("relabels sessions after removal", () => {
    const relabeled = relabelTerminalSessions([session("1", "Session 1"), session("3", "Session 3")]);
    expect(relabeled.map((s) => s.label)).toEqual(["Session 1", "Session 2"]);
  });

  it("keeps the documented cap constant", () => {
    expect(MAX_TERMINAL_SESSIONS).toBe(5);
  });
});
