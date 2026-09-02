import { describe, it, expect } from "vitest";
import { resolveFilteringKey } from "../src/tui/components/App.js";
import { resolveActionLauncher } from "../src/tui/actions.js";
import { matchesFilter, toggleSelection, computeScrollWindow, mergeBlocks, sortBlocks, rowSort, sortRowsHierarchically, clampSplitRatio, MIN_PANE_COLS } from "../src/tui/utils.js";
import type { WorktreeRow, RepoBlock } from "../src/tui/types.js";
import { readFileSync } from "node:fs";

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
  depsStrategy: "npm",
  base: "main",
};

describe("TUI Interactions", () => {
  it("matchesFilter finds matches correctly", () => {
    expect(matchesFilter(mockRow, "")).toBe(true);
    expect(matchesFilter(mockRow, "feat")).toBe(true);
    expect(matchesFilter(mockRow, "wtx")).toBe(true);
    expect(matchesFilter(mockRow, "123")).toBe(true);
    expect(matchesFilter(mockRow, "alice")).toBe(true);
    expect(matchesFilter(mockRow, "open")).toBe(true);
    expect(matchesFilter(mockRow, "main")).toBe(true);
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

function block(name: string, branches: string[]): RepoBlock {
  return {
    repoName: name,
    rows: branches.map((branch, i) => ({
      ...mockRow,
      repoName: name,
      branch,
      path: `/tmp/${name}/${i}`,
    })),
  };
}

describe("TUI repo ordering", () => {
  it("mergeBlocks sorts repos alphabetically without scope (full refresh)", () => {
    const merged = mergeBlocks([], [block("zeta", ["a"]), block("alpha", ["b"]), block("Mid", ["c"])]);
    expect(merged.map(b => b.repoName)).toEqual(["alpha", "Mid", "zeta"]);
  });

  it("mergeBlocks keeps alphabetical order across scoped refreshes regardless of arrival order", () => {
    const initial = mergeBlocks([], [block("alpha", ["a"]), block("beta", ["b"]), block("gamma", ["g"])]);
    const refreshed = mergeBlocks(initial, [block("beta", ["b2"])], new Set(["beta"]));
    expect(refreshed.map(b => b.repoName)).toEqual(["alpha", "beta", "gamma"]);

    const refreshedAgain = mergeBlocks(initial, [block("alpha", ["a2"])], new Set(["alpha"]));
    expect(refreshedAgain.map(b => b.repoName)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sortBlocks sorts a mixed list alphabetically", () => {
    const sorted = sortBlocks([block("zebra", []), block("apple", []), block("Banana", [])]);
    expect(sorted.map(b => b.repoName)).toEqual(["apple", "Banana", "zebra"]);
  });

  it("rowSort keeps main checkout first then sorts branches alphabetically", () => {
    const main: WorktreeRow = { ...mockRow, branch: "main", isMainCheckout: true };
    const z: WorktreeRow = { ...mockRow, branch: "z-branch" };
    const a: WorktreeRow = { ...mockRow, branch: "a-branch" };
    const sorted = [z, main, a].sort(rowSort);
    expect(sorted.map(r => r.branch)).toEqual(["main", "a-branch", "z-branch"]);
  });

  it("sortRowsHierarchically places children after their base and preserves unrelated roots", () => {
    const main: WorktreeRow = { ...mockRow, branch: "main", isMainCheckout: true, base: undefined };
    const api: WorktreeRow = { ...mockRow, branch: "feature/api", base: "main" };
    const docs: WorktreeRow = { ...mockRow, branch: "feature/docs", base: "main" };
    const ui: WorktreeRow = { ...mockRow, branch: "feature/ui", base: "feature/api" };
    const tests: WorktreeRow = { ...mockRow, branch: "feature/tests", base: "feature/ui" };
    const independent: WorktreeRow = { ...mockRow, branch: "hotfix", base: undefined };

    const sorted = sortRowsHierarchically([tests, ui, independent, docs, api, main]);

    expect(sorted.map(row => row.branch)).toEqual([
      "main",
      "feature/api",
      "feature/ui",
      "feature/tests",
      "feature/docs",
      "hotfix",
    ]);
    expect(sorted.map(row => row.hierarchyPrefix)).toEqual(["", "├─ ", "│  └─ ", "│     └─ ", "└─ ", ""]);
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

describe("clampSplitRatio", () => {
  it("clamps to min/max based on MIN_PANE_COLS", () => {
    expect(clampSplitRatio(100, 0.05)).toBe(MIN_PANE_COLS / 100);
    expect(clampSplitRatio(100, 0.95)).toBe((100 - MIN_PANE_COLS - 3) / 100);
    expect(clampSplitRatio(100, 0.6)).toBe(0.6);
  });
  it("returns 0.5 for tiny widths", () => {
    expect(clampSplitRatio(30, 0.9)).toBe(0.5);
    expect(clampSplitRatio(43, 0.1)).toBe(0.5);
  });
  it("keeps ratio within bounds for various widths", () => {
    expect(clampSplitRatio(80, 0.6)).toBeGreaterThanOrEqual(MIN_PANE_COLS / 80);
    expect(clampSplitRatio(80, 0.6)).toBeLessThanOrEqual((80 - MIN_PANE_COLS - 3) / 80);
  });
});

describe("InputModal controlled value", () => {
  it("binds rendered value to component state and keeps initialValue in state only", () => {
    const source = readFileSync(new URL("../src/tui/components/InputModal.tsx", import.meta.url), "utf8");

    expect(source).toContain('const [value, setValue] = useState(initialValue ?? "")');
    expect(source).toContain('value={value}');
    expect(source).not.toContain('value={initialValue ?? ""}');
  });
});

describe("TUI filter input", () => {
  it("binds rendered filter value to filterText while onInput updates state", () => {
    const source = readFileSync(new URL("../src/tui/components/App.tsx", import.meta.url), "utf8");
    const filterInput = source.match(/<input\s+focused=\{true\}[\s\S]*?onInput=\{\(v: string\) => setFilterText\(v\)\}[\s\S]*?\/>/)?.[0] ?? "";

    expect(filterInput).toContain("value={filterText}");
  });

  it("lets printable filter keys reach the focused input and build filterText", () => {
    let filterText = "";

    for (const keyName of ["f", "e", "a", "t"]) {
      const action = resolveFilteringKey({ isFiltering: true, filterText, selectedIndex: 3 }, keyName);
      if (action.deliverToInput) filterText += keyName;
      expect(action.skipAppShortcuts).toBe(true);
      expect(action.handledByApp).toBe(false);
    }

    expect(filterText).toBe("feat");
  });

  it("escape clears the filter, resets selection, and exits filtering", () => {
    const action = resolveFilteringKey({ isFiltering: true, filterText: "feat", selectedIndex: 4 }, "escape");

    expect(action).toEqual({
      handledByApp: true,
      skipAppShortcuts: true,
      deliverToInput: false,
      next: { isFiltering: false, filterText: "", selectedIndex: 0 },
    });
  });

  it("return exits filtering while preserving filterText", () => {
    const action = resolveFilteringKey({ isFiltering: true, filterText: "feat", selectedIndex: 4 }, "return");

    expect(action).toEqual({
      handledByApp: true,
      skipAppShortcuts: true,
      deliverToInput: false,
      next: { isFiltering: false, filterText: "feat", selectedIndex: 4 },
    });
  });

  it("keeps d and q as input text while filtering instead of triggering app shortcuts", () => {
    let filterText = "";
    const triggeredActions: string[] = [];

    for (const keyName of ["d", "q"]) {
      const action = resolveFilteringKey({ isFiltering: true, filterText, selectedIndex: 1 }, keyName);
      if (!action.skipAppShortcuts) triggeredActions.push(keyName === "d" ? "remove" : "quit");
      if (action.deliverToInput) filterText += keyName;
    }

    expect(triggeredActions).toEqual([]);
    expect(filterText).toBe("dq");
  });
});
