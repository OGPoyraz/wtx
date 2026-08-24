import { describe, it, expect } from "vitest";
import { resolveActionLauncher } from "../src/tui/actions.js";
import { matchesFilter, toggleSelection, computeScrollWindow } from "../src/tui/utils.js";
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

  it("computeScrollWindow handles boundaries correctly", () => {
    expect(computeScrollWindow(0, 5, 10, 20)).toEqual({ start: 0, end: 10 });
    expect(computeScrollWindow(10, 0, 10, 20)).toEqual({ start: 1, end: 11 });
    expect(computeScrollWindow(19, 5, 10, 20)).toEqual({ start: 10, end: 20 });
    expect(computeScrollWindow(0, 0, 10, 0)).toEqual({ start: 0, end: 0 });
    expect(computeScrollWindow(4, 8, 10, 5)).toEqual({ start: 0, end: 5 });
  });


});

describe("resolveActionLauncher", () => {
  it("prefers wtx from PATH over everything (compiled or not)", () => {
    const res = resolveActionLauncher(
      ["/$bunfs/root/wtx", "terminal"],
      args,
      { whichWtx: "/usr/local/bin/wtx", execPath: "/$bunfs/root/wtx" }
    );
    expect(res).toEqual({ cmd: "/usr/local/bin/wtx", args });
    expect(resolveActionLauncher(
      ["/usr/bin/bun", "/repo/src/index.ts", "terminal"],
      args,
      { whichWtx: "/usr/local/bin/wtx", execPath: "/usr/bin/bun" }
    ).cmd).toBe("/usr/local/bin/wtx");
  });
  const args = ["open", "feat/x", "--repo", "r"];

  it("uses PATH wtx inside compiled binaries ($bunfs virtual paths)", () => {
    const res = resolveActionLauncher(
      ["/$bunfs/root/wtx", "terminal"],
      args,
      { whichWtx: "/usr/local/bin/wtx", execPath: "/$bunfs/root/wtx" }
    );
    expect(res).toEqual({ cmd: "/usr/local/bin/wtx", args });
  });

  it("falls back to execPath when wtx is not on PATH in compiled mode", () => {
    const res = resolveActionLauncher(
      ["/$bunfs/root/wtx", "terminal"],
      args,
      { whichWtx: null, execPath: "/Users/x/Repos/wtx-wt/feat/next/dist/wtx" }
    );
    expect(res).toEqual({ cmd: "/Users/x/Repos/wtx-wt/feat/next/dist/wtx", args });
  });

  it("reconstructs bun dev invocation (bun + script before terminal)", () => {
    const argv = ["/usr/bin/bun", "/repo/src/index.ts", "terminal"];
    const res = resolveActionLauncher(argv, args, { whichWtx: null, execPath: "/usr/bin/bun" });
    expect(res).toEqual({ cmd: "/usr/bin/bun", args: ["/repo/src/index.ts", ...args] });
  });

  it("falls back to argv0 with plain action args when terminal token absent", () => {
    const res = resolveActionLauncher(["/node", "/lib/cli.mjs"], args, { whichWtx: null, execPath: "/node" });
    expect(res).toEqual({ cmd: "/node", args });
  });
});
