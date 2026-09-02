import { describe, it, expect } from "vitest";
import fs from "fs";
import {
  mergeBlocks,
  mergeWarnings,
  makePlaceholderRow,
  withCreatePlaceholders,
  rowSort,
  sortBlocks,
} from "../src/tui/utils.js";
import type { RepoBlock, WorktreeRow } from "../src/tui/types.js";
import { createTempConfig } from "./setup.js";
import { loadConfig, saveConfig, getConfigPath } from "../src/lib/config.js";

function row(repoName: string, branch: string, isMain = false): WorktreeRow {
  return {
    repoName,
    branch,
    path: `/tmp/${repoName}/${branch}`,
    commitShort: "abc1234",
    isMainCheckout: isMain,
    isLocked: false,
    isPrunable: false,
    isBare: false,
    dirtyFiles: [],
    ahead: null,
    behind: null,
    prNumber: null,
    prState: null,
    prChecks: null,
    prUrl: null,
    owner: null,
    rebaseStatus: null,
    depsStrategy: "none",
  };
}

function block(repoName: string, rows: WorktreeRow[]): RepoBlock {
  return { repoName, rows: [...rows].sort(rowSort) };
}

describe("mergeBlocks", () => {
  it("replaces everything without scope", () => {
    const prev = [block("a", [row("a", "main", true)])];
    const next = [block("b", [row("b", "main", true)])];
    expect(mergeBlocks(prev, next)).toEqual(next);
  });

  it("keeps unscoped repos and replaces scoped ones", () => {
    const prev = [
      block("a", [row("a", "main", true)]),
      block("b", [row("b", "old")]),
    ];
    const next = [block("b", [row("b", "new")])];
    const merged = mergeBlocks(prev, next, new Set(["b"]));
    expect(merged.map(b => b.repoName)).toEqual(["a", "b"]);
    expect(merged[1]!.rows[0]!.branch).toBe("new");
  });

  it("drops scoped repos that no longer have worktrees", () => {
    const prev = [
      block("a", [row("a", "main", true)]),
      block("b", [row("b", "feat")]),
    ];
    const merged = mergeBlocks(prev, [], new Set(["b"]));
    expect(merged.map(b => b.repoName)).toEqual(["a"]);
  });

  it("sorts result by repo name", () => {
    const prev = [block("z", [row("z", "main", true)])];
    const next = [block("a", [row("a", "main", true)])];
    const merged = mergeBlocks(prev, next, new Set(["a"]));
    expect(merged.map(b => b.repoName)).toEqual(["a", "z"]);
  });
});

describe("mergeWarnings", () => {
  it("keeps warnings from unscoped repos", () => {
    const prev = [
      { repoName: "a", message: "PR lookup failed for a" },
      { repoName: "b", message: "Failed to process repo b" },
    ];
    const merged = mergeWarnings(prev, [], new Set(["b"]));
    expect(merged).toEqual([{ repoName: "a", message: "PR lookup failed for a" }]);
  });

  it("replaces all without scope", () => {
    const prev = [{ repoName: "a", message: "old" }];
    const next = [{ repoName: "a", message: "new" }];
    expect(mergeWarnings(prev, next)).toEqual(next);
  });
});

describe("sortBlocks favorites", () => {
  it("pins favorites to the top in configured order, remainder alphabetical", () => {
    const blocks = [
      block("alpha", [row("alpha", "main", true)]),
      block("beta", [row("beta", "main", true)]),
      block("gamma", [row("gamma", "main", true)]),
    ];
    const sorted = sortBlocks(blocks, ["gamma"]);
    expect(sorted.map(b => b.repoName)).toEqual(["gamma", "alpha", "beta"]);
  });

  it("preserves multi-favorite order and alphabetizes rest", () => {
    const blocks = [
      block("alpha", [row("alpha", "main", true)]),
      block("beta", [row("beta", "main", true)]),
      block("delta", [row("delta", "main", true)]),
      block("gamma", [row("gamma", "main", true)]),
    ];
    const sorted = sortBlocks(blocks, ["gamma", "alpha"]);
    expect(sorted.map(b => b.repoName)).toEqual(["gamma", "alpha", "beta", "delta"]);
  });

  it("keeps alphabetical order when no favorites given", () => {
    const blocks = [
      block("gamma", [row("gamma", "main", true)]),
      block("alpha", [row("alpha", "main", true)]),
      block("beta", [row("beta", "main", true)]),
    ];
    const sorted = sortBlocks(blocks);
    expect(sorted.map(b => b.repoName)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("ignores unknown favorite entries", () => {
    const blocks = [
      block("alpha", [row("alpha", "main", true)]),
      block("beta", [row("beta", "main", true)]),
    ];
    const sorted = sortBlocks(blocks, ["missing", "beta"]);
    expect(sorted.map(b => b.repoName)).toEqual(["beta", "alpha"]);
  });
});

describe("mergeBlocks favorites", () => {
  it("applies favorite ordering when merging without scope", () => {
    const prev: RepoBlock[] = [];
    const next = [
      block("alpha", [row("alpha", "main", true)]),
      block("beta", [row("beta", "main", true)]),
      block("gamma", [row("gamma", "main", true)]),
    ];
    const merged = mergeBlocks(prev, next, undefined, ["gamma"]);
    expect(merged.map(b => b.repoName)).toEqual(["gamma", "alpha", "beta"]);
  });

  it("applies favorite ordering when merging scoped updates", () => {
    const prev = [
      block("alpha", [row("alpha", "old")]),
      block("beta", [row("beta", "main", true)]),
      block("gamma", [row("gamma", "main", true)]),
    ];
    const next = [block("alpha", [row("alpha", "new")])];
    const merged = mergeBlocks(prev, next, new Set(["alpha"]), ["gamma"]);
    expect(merged.map(b => b.repoName)).toEqual(["gamma", "alpha", "beta"]);
    const alphaRow = merged.find(b => b.repoName === "alpha")?.rows[0];
    expect(alphaRow?.branch).toBe("new");
  });
});

describe("favorites config toggle", () => {
  it("adds a repo to favorites via saveConfig without touching other fields", () => {
    const { path: configPath } = createTempConfig({
      ide: "vscode",
      repos: {
        alpha: {
          main_branch: "auto",
          fetch_main_on_create: true,
          install_script: null,
          check_prs: true,
          forge_provider: "auto",
          pr_lookup_repo: null,
          deps: { manager: "auto", strategy: "auto" },
        },
      },
    });

    const loaded = loadConfig();
    expect(loaded.favorites).toEqual([]);

    saveConfig({ ...loaded, favorites: [...loaded.favorites, "alpha"] });

    const stored = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(stored.favorites).toEqual(["alpha"]);
    expect(stored.ide).toBe("vscode");
    expect(Object.keys(stored.repos)).toEqual(["alpha"]);
    expect(configPath).toBe(getConfigPath());
  });

  it("removes a repo from favorites via saveConfig", () => {
    const { path: configPath } = createTempConfig({
      favorites: ["gamma", "alpha"],
      repos: {
        alpha: {
          main_branch: "auto",
          fetch_main_on_create: true,
          install_script: null,
          check_prs: true,
          forge_provider: "auto",
          pr_lookup_repo: null,
          deps: { manager: "auto", strategy: "auto" },
        },
        gamma: {
          main_branch: "auto",
          fetch_main_on_create: true,
          install_script: null,
          check_prs: true,
          forge_provider: "auto",
          pr_lookup_repo: null,
          deps: { manager: "auto", strategy: "auto" },
        },
      },
    });

    const loaded = loadConfig();
    expect(loaded.favorites).toEqual(["gamma", "alpha"]);

    saveConfig({ ...loaded, favorites: loaded.favorites.filter(n => n !== "gamma") });

    const stored = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(stored.favorites).toEqual(["alpha"]);
    expect(Object.keys(stored.repos).sort()).toEqual(["alpha", "gamma"]);
  });
});

describe("withCreatePlaceholders", () => {
  it("inserts placeholder in sorted position within its repo block", () => {
    const blocks = [
      block("api", [row("api", "main", true), row("api", "feat/a"), row("api", "feat/z")]),
      block("web", [row("web", "main", true)]),
    ];
    const result = withCreatePlaceholders(blocks, [{ repoName: "api", branch: "feat/m" }]);
    const apiRows = result[0]!.rows;
    expect(apiRows.map(r => r.branch)).toEqual(["main", "feat/a", "feat/m", "feat/z"]);
    expect(apiRows[2]!.isPendingCreate).toBe(true);
    expect(result[1]!.rows.every(r => !r.isPendingCreate)).toBe(true);
  });

  it("does not mutate input blocks", () => {
    const blocks = [block("api", [row("api", "main", true)])];
    withCreatePlaceholders(blocks, [{ repoName: "api", branch: "x" }]);
    expect(blocks[0]!.rows.length).toBe(1);
  });

  it("returns input untouched when nothing is creating", () => {
    const blocks = [block("api", [row("api", "main", true)])];
    expect(withCreatePlaceholders(blocks, [])).toBe(blocks);
  });

  it("placeholder paths never collide with real rows", () => {
    const placeholder = makePlaceholderRow("api", "feat/x");
    expect(placeholder.path).not.toBe(row("api", "feat/x").path);
    expect(placeholder.isPendingCreate).toBe(true);
    expect(placeholder.dirtyFiles).toEqual([]);
  });
});
