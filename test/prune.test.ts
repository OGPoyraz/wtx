import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { selectMergedCandidates } from "../src/lib/prune.js";
import type { Worktree } from "../src/lib/git.js";
import type { PrInfo } from "../src/lib/forge/types.js";

const MAIN_PATH = "/repos/wtx";

function makeWt(partial: Partial<Worktree>): Worktree {
  return {
    path: "/repos/wtx-wt/branch",
    branch: "branch",
    commit: "abc1234",
    isLocked: false,
    isPrunable: false,
    isBare: false,
    ...partial,
  };
}

function makePr(state: PrInfo["state"], number = 1): PrInfo {
  return {
    number,
    authorLogin: null,
    title: "something",
    url: `https://github.com/o/r/pull/${number}`,
    state,
    isDraft: false,
    mergeable: "clean",
    checks: { total: 0, passed: 0, failed: 0, pending: 0 },
    reviewDecision: null,
    unresolvedThreads: 0,
    updatedAt: "2026-08-22T00:00:00Z",
  };
}

describe("selectMergedCandidates", () => {
  it("selects only non-main worktrees whose PR is merged", () => {
    const worktrees = [
      makeWt({ path: MAIN_PATH, branch: undefined }),
      makeWt({ path: "/repos/wtx-wt/feat/a", branch: "feat/a" }),
      makeWt({ path: "/repos/wtx-wt/fix/b", branch: "fix/b" }),
      makeWt({ path: "/repos/wtx-wt/chore/c", branch: "chore/c" }),
    ];
    const prMap = new Map([
      ["feat/a", makePr("open")],
      ["fix/b", makePr("merged", 14)],
      ["chore/c", makePr("closed")],
    ]);

    expect(selectMergedCandidates(worktrees, MAIN_PATH, prMap)).toEqual([
      { branch: "fix/b", path: "/repos/wtx-wt/fix/b", prNumber: 14 },
    ]);
  });

  it("never selects closed, draft, or unknown branches", () => {
    const worktrees = [
      makeWt({ path: "/repos/wtx-wt/closed-x", branch: "closed-x" }),
      makeWt({ path: "/repos/wtx-wt/draft-y", branch: "draft-y" }),
      makeWt({ path: "/repos/wtx-wt/no-pr-z", branch: "no-pr-z" }),
    ];
    const prMap = new Map([
      ["closed-x", makePr("closed")],
      ["draft-y", makePr("open")],
    ]);
    prMap.get("draft-y")!.isDraft = true;

    expect(selectMergedCandidates(worktrees, MAIN_PATH, prMap)).toEqual([]);
  });

  it("still selects locked worktrees so the command can decide with --force", () => {
    const worktrees = [
      makeWt({ path: "/repos/wtx-wt/old", branch: "old", isLocked: true }),
    ];
    const prMap = new Map([["old", makePr("merged", 7)]]);

    expect(selectMergedCandidates(worktrees, MAIN_PATH, prMap)).toEqual([
      { branch: "old", path: "/repos/wtx-wt/old", prNumber: 7 },
    ]);
  });

  it("returns empty when there are no merged PRs at all", () => {
    const worktrees = [makeWt({ path: "/repos/wtx-wt/feat/a", branch: "feat/a" })];
    expect(selectMergedCandidates(worktrees, MAIN_PATH, new Map())).toEqual([]);
  });
});

import fs from "fs";
import path from "path";
import os from "os";
import { cleanupEmptyParents, isSafeWorktreeConfig } from "../src/lib/path-safety.js";

describe("cleanupEmptyParents & isSafeWorktreeConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wtx-prune-test-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cleanup stops at wtRoot boundary", () => {
    const wtRoot = path.join(tmpDir, "wts");
    const mainPath = path.join(tmpDir, "main");
    const deepEmpty = path.join(wtRoot, "feat", "a", "b");
    
    fs.mkdirSync(deepEmpty, { recursive: true });
    
    // Simulate removing the worktree at 'b'
    fs.rmdirSync(deepEmpty);
    const removed = cleanupEmptyParents(wtRoot, mainPath, deepEmpty);
    
    // Should have removed 'a' and 'feat', but NOT 'wts'
    expect(removed).toContain(path.join(wtRoot, "feat", "a"));
    expect(removed).toContain(path.join(wtRoot, "feat"));
    expect(removed).not.toContain(wtRoot);
    expect(fs.existsSync(wtRoot)).toBe(true);
    expect(fs.existsSync(path.join(wtRoot, "feat"))).toBe(false);
  });

  it("nested repo containing .git stops the walk", () => {
    const wtRoot = path.join(tmpDir, "wts");
    const mainPath = path.join(tmpDir, "main");
    const repoPath = path.join(wtRoot, "nested-repo");
    const emptySub = path.join(repoPath, "empty");
    
    fs.mkdirSync(emptySub, { recursive: true });
    fs.mkdirSync(path.join(repoPath, ".git"));
    
    // Simulate removing worktree at 'empty'
    fs.rmdirSync(emptySub);
    const removed = cleanupEmptyParents(wtRoot, mainPath, emptySub);
    
    // Should not have removed repoPath because it contains .git
    expect(removed).not.toContain(repoPath);
    expect(fs.existsSync(repoPath)).toBe(true);
  });

  it("misconfigured root cannot delete unrelated sibling dirs", () => {
    const mainPath = path.join(tmpDir, "main");
    // Misconfigured: wtRoot points to something outside or parallel, 
    // but the actual removed path is sibling to main
    const wtRoot = path.join(tmpDir, "other"); 
    
    const siblingEmpty = path.join(tmpDir, "sibling", "empty");
    fs.mkdirSync(siblingEmpty, { recursive: true });
    
    fs.rmdirSync(siblingEmpty);
    const removed = cleanupEmptyParents(wtRoot, mainPath, siblingEmpty);
    
    // Should not remove sibling because it is not within wtRoot
    expect(removed.length).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "sibling"))).toBe(true);
  });

  it("registered-membership check prevents misconfigured boundary deletions (isSafeWorktreeConfig)", () => {
    const root = path.join(tmpDir, "project");
    const main = path.join(root, "main");
    const wts = path.join(root, "wts");

    expect(isSafeWorktreeConfig(wts, main)).toBe(true);
    
    // wtRoot === mainPath
    expect(isSafeWorktreeConfig(main, main)).toBe(false);
    
    // wtRoot contains mainPath
    expect(isSafeWorktreeConfig(root, main)).toBe(false);
    
    // mainPath contains wtRoot
    const innerWts = path.join(main, "wts");
    expect(isSafeWorktreeConfig(innerWts, main)).toBe(false);
  });
});
