import { describe, it, expect } from "vitest";
import { matchesFilter, toggleSelection } from "../src/tui/utils.js";
import type { WorktreeRow } from "../src/tui/types.js";

const mockRow: WorktreeRow = {
  repoName: "wtx",
  branch: "feat/foo",
  path: "/tmp/wtx/feat/foo",
  commitShort: "a1b2c3d",
  isMainCheckout: false,
  isLocked: false,
  isPrunable: false,
  isBare: false,
  dirtyFiles: [],
  ahead: 0,
  behind: 0,
  prNumber: 123,
  prState: "OPEN",
  prChecks: "success",
  prUrl: "https://github.com/wtx/pull/123",
  owner: "alice",
  rebaseStatus: null,
  depsStrategy: "npm"
};

describe("TUI Interactions", () => {
  it("matchesFilter finds matches correctly", () => {
    expect(matchesFilter(mockRow, "")).toBe(true);
    expect(matchesFilter(mockRow, "feat")).toBe(true);
    expect(matchesFilter(mockRow, "wtx")).toBe(true);
    expect(matchesFilter(mockRow, "123")).toBe(true);
    expect(matchesFilter(mockRow, "alice")).toBe(true);
    expect(matchesFilter(mockRow, "open")).toBe(true);
    expect(matchesFilter(mockRow, "nope")).toBe(false);
  });

  it("toggleSelection adds and removes", () => {
    let sel = new Set<string>();
    sel = toggleSelection(sel, "/tmp/a");
    expect(sel.has("/tmp/a")).toBe(true);
    sel = toggleSelection(sel, "/tmp/a");
    expect(sel.has("/tmp/a")).toBe(false);
  });
});
