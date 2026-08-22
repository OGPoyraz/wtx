import { describe, it, expect } from "vitest";
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
