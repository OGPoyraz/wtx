import { describe, it, expect } from "vitest";
import {
  PR_DISPLAY_STATES,
  derivePrDisplay,
  displayStateRank,
  type PrInfo,
} from "../src/lib/forge/types.js";
import {
  bucketChecks,
  collectCheckItems,
  mapGithubPr,
  mapGithubPrList,
  mapPrHead,
} from "../src/lib/forge/map.js";
import { parseGithubRemote, descriptorFor } from "../src/lib/forge/index.js";
import { createGithubAdapter } from "../src/lib/forge/github.js";
import { validateSafeBranchName, localBranchExists } from "../src/lib/git.js";

function makePr(overrides: Partial<PrInfo> = {}): PrInfo {
  return {
    number: 42,
    authorLogin: null,
    title: "feat: something",
    url: "https://github.com/ogp/r/pull/42",
    state: "open",
    isDraft: false,
    mergeable: "clean",
    checks: { total: 0, passed: 0, failed: 0, pending: 0 },
    reviewDecision: null,
    unresolvedThreads: 0,
    updatedAt: "2026-08-21T14:03:00Z",
    ...overrides,
  };
}


describe("derivePrDisplay", () => {
  const cases: Array<{ name: string; pr: PrInfo; expected: string }> = [
    {
      name: "merged PR maps to MERGED regardless of other signals",
      pr: makePr({ state: "merged", mergeable: "conflicting", checks: { total: 1, passed: 0, failed: 1, pending: 0 } }),
      expected: PR_DISPLAY_STATES.MERGED,
    },
    {
      name: "closed PR maps to CLOSED",
      pr: makePr({ state: "closed" }),
      expected: PR_DISPLAY_STATES.CLOSED,
    },
    {
      name: "draft wins over conflicts",
      pr: makePr({ isDraft: true, mergeable: "conflicting" }),
      expected: PR_DISPLAY_STATES.DRAFT,
    },
    {
      name: "conflicts win over CI failure",
      pr: makePr({ mergeable: "conflicting", checks: { total: 2, passed: 0, failed: 2, pending: 0 } }),
      expected: PR_DISPLAY_STATES.CONFLICTED,
    },
    {
      name: "CI failure wins over changes requested",
      pr: makePr({
        checks: { total: 1, passed: 0, failed: 1, pending: 0 },
        reviewDecision: "changes_requested",
      }),
      expected: PR_DISPLAY_STATES.CI_FAILING,
    },
    {
      name: "changes requested wins over pending checks",
      pr: makePr({
        reviewDecision: "changes_requested",
        checks: { total: 2, passed: 1, failed: 0, pending: 1 },
      }),
      expected: PR_DISPLAY_STATES.CHANGES_REQUESTED,
    },
    {
      name: "pending checks win over unresolved threads",
      pr: makePr({
        checks: { total: 2, passed: 1, failed: 0, pending: 1 },
        unresolvedThreads: 3,
      }),
      expected: PR_DISPLAY_STATES.CI_RUNNING,
    },
    {
      name: "unresolved threads win over approval",
      pr: makePr({ unresolvedThreads: 1, reviewDecision: "approved" }),
      expected: PR_DISPLAY_STATES.IN_REVIEW,
    },
    {
      name: "approval without signals maps to APPROVED",
      pr: makePr({ reviewDecision: "approved", checks: { total: 3, passed: 3, failed: 0, pending: 0 } }),
      expected: PR_DISPLAY_STATES.APPROVED,
    },
    {
      name: "open PR without any signal falls back to AWAITING_REVIEW",
      pr: makePr(),
      expected: PR_DISPLAY_STATES.AWAITING_REVIEW,
    },
    {
      name: "pending checks beat approval when checks are running",
      pr: makePr({
        reviewDecision: "approved",
        checks: { total: 2, passed: 1, failed: 0, pending: 1 },
      }),
      expected: PR_DISPLAY_STATES.CI_RUNNING,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(derivePrDisplay(c.pr).primary).toBe(c.expected);
    });
  }
});

describe("derivePrDisplay awaitingReview secondary flag", () => {
  it("is true for an open unreviewed PR whose primary state is actionable", () => {
    const display = derivePrDisplay(
      makePr({ mergeable: "conflicting" })
    );
    expect(display.awaitingReview).toBe(true);
  });

  it("is false when primary state is already AWAITING_REVIEW", () => {
    expect(derivePrDisplay(makePr()).awaitingReview).toBe(false);
  });

  it("is false once a reviewer requested changes", () => {
    expect(
      derivePrDisplay(makePr({ reviewDecision: "changes_requested" })).awaitingReview
    ).toBe(false);
  });

  it("is false once approved", () => {
    expect(derivePrDisplay(makePr({ reviewDecision: "approved" })).awaitingReview).toBe(false);
  });

  it("is true while review is ongoing via threads alone", () => {
    expect(derivePrDisplay(makePr({ unresolvedThreads: 2 })).awaitingReview).toBe(true);
  });

  it("is false for drafts", () => {
    expect(derivePrDisplay(makePr({ isDraft: true })).awaitingReview).toBe(false);
  });

  it("is false for terminal states", () => {
    expect(derivePrDisplay(makePr({ state: "merged" })).awaitingReview).toBe(false);
    expect(derivePrDisplay(makePr({ state: "closed" })).awaitingReview).toBe(false);
  });
});

describe("derivePrDisplay approved secondary flag", () => {
  it("is true when approved despite conflicts", () => {
    const display = derivePrDisplay(
      makePr({ mergeable: "conflicting", reviewDecision: "approved" })
    );
    expect(display.primary).toBe(PR_DISPLAY_STATES.CONFLICTED);
    expect(display.approved).toBe(true);
    expect(display.awaitingReview).toBe(false);
  });

  it("is true when approved despite CI failure", () => {
    const display = derivePrDisplay(
      makePr({ checks: { total: 2, passed: 0, failed: 2, pending: 0 }, reviewDecision: "approved" })
    );
    expect(display.approved).toBe(true);
  });

  it("is false when APPROVED is already the primary state", () => {
    const display = derivePrDisplay(makePr({ reviewDecision: "approved" }));
    expect(display.primary).toBe(PR_DISPLAY_STATES.APPROVED);
    expect(display.approved).toBe(false);
  });

  it("is false when reviewer requested changes", () => {
    expect(
      derivePrDisplay(makePr({ reviewDecision: "changes_requested" })).approved
    ).toBe(false);
  });
});

describe("displayStateRank", () => {
  it("ranks attention states before passive ones", () => {
    expect(displayStateRank(PR_DISPLAY_STATES.CONFLICTED)).toBeLessThan(
      displayStateRank(PR_DISPLAY_STATES.CI_RUNNING)
    );
    expect(displayStateRank(PR_DISPLAY_STATES.CI_FAILING)).toBeLessThan(
      displayStateRank(PR_DISPLAY_STATES.APPROVED)
    );
    expect(displayStateRank(PR_DISPLAY_STATES.APPROVED)).toBeLessThan(
      displayStateRank(PR_DISPLAY_STATES.AWAITING_REVIEW)
    );
  });
});

describe("bucketChecks", () => {
  it("buckets CheckRun conclusions into passed, failed, pending", () => {
    const items = collectCheckItems([
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
      { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null },
      { __typename: "CheckRun", status: "QUEUED", conclusion: null },
    ]);
    expect(bucketChecks(items)).toEqual({ total: 4, passed: 1, failed: 1, pending: 2 });
  });

  it("treats TIMED_OUT, CANCELLED, ACTION_REQUIRED, STARTUP_FAILURE and STALE as failures", () => {
    const items = collectCheckItems([
      { __typename: "CheckRun", conclusion: "TIMED_OUT" },
      { __typename: "CheckRun", conclusion: "CANCELLED" },
      { __typename: "CheckRun", conclusion: "ACTION_REQUIRED" },
      { __typename: "CheckRun", conclusion: "STARTUP_FAILURE" },
      { __typename: "CheckRun", conclusion: "STALE" },
    ]);
    expect(bucketChecks(items)).toEqual({ total: 5, passed: 0, failed: 5, pending: 0 });
  });

  it("excludes NEUTRAL and SKIPPED runs from totals", () => {
    const items = collectCheckItems([
      { __typename: "CheckRun", conclusion: "SUCCESS" },
      { __typename: "CheckRun", conclusion: "NEUTRAL" },
      { __typename: "CheckRun", conclusion: "SKIPPED" },
    ]);
    expect(bucketChecks(items)).toEqual({ total: 1, passed: 1, failed: 0, pending: 0 });
  });

  it("buckets legacy StatusContext states", () => {
    const items = collectCheckItems([
      { __typename: "StatusContext", state: "SUCCESS" },
      { __typename: "StatusContext", state: "FAILURE" },
      { __typename: "StatusContext", state: "ERROR" },
      { __typename: "StatusContext", state: "PENDING" },
      { __typename: "StatusContext", state: "EXPECTED" },
    ]);
    expect(bucketChecks(items)).toEqual({ total: 5, passed: 1, failed: 2, pending: 2 });
  });

  it("returns zeroed counts for an empty rollup", () => {
    expect(bucketChecks([])).toEqual({ total: 0, passed: 0, failed: 0, pending: 0 });
  });
});

describe("collectCheckItems nested Commit variant", () => {
  it("unwraps commit.statusCheckRollup.contexts.nodes when gh returns the nested shape", () => {
    const items = collectCheckItems([
      {
        __typename: "Commit",
        commit: {
          statusCheckRollup: {
            contexts: {
              nodes: [
                { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
                { __typename: "StatusContext", state: "FAILURE" },
              ],
            },
          },
        },
      },
    ]);
    expect(items).toHaveLength(2);
    expect(bucketChecks(items).failed).toBe(1);
    expect(bucketChecks(items).passed).toBe(1);
  });

  it("handles mixed flat and nested entries", () => {
    const items = collectCheckItems([
      { __typename: "CheckRun", conclusion: "SUCCESS" },
      {
        __typename: "Commit",
        commit: {
          statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", conclusion: "FAILURE" }] } },
        },
      },
    ]);
    expect(bucketChecks(items)).toEqual({ total: 2, passed: 1, failed: 1, pending: 0 });
  });
});

describe("mapGithubPr", () => {
  it("maps a complete gh pr list item", () => {
    const pr = mapGithubPr({
      number: 7,
      title: "fix: token refresh",
      url: "https://github.com/o/r/pull/7",
      state: "OPEN",
      isDraft: false,
      mergeable: "CONFLICTING",
      statusCheckRollup: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" }],
      reviewDecision: "REVIEW_REQUIRED",
      headRefName: "ogp/fix-token",
      updatedAt: "2026-08-21T10:00:00Z",
    });

    expect(pr).toEqual({
      number: 7,
      authorLogin: null,
      title: "fix: token refresh",
      url: "https://github.com/o/r/pull/7",
      state: "open",
      isDraft: false,
      mergeable: "conflicting",
      checks: { total: 1, passed: 1, failed: 0, pending: 0 },
      reviewDecision: null,
      unresolvedThreads: 0,
      updatedAt: "2026-08-21T10:00:00Z",
    });
  });

  it("maps author.login if present and valid", () => {
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "OPEN", author: { login: "alice" } })?.authorLogin).toBe("alice");
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "OPEN", author: { login: 123 } })?.authorLogin).toBeNull();
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "OPEN" })?.authorLogin).toBeNull();
  });

  it("maps review decisions", () => {
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "OPEN", reviewDecision: "APPROVED" })?.reviewDecision).toBe("approved");
    expect(
      mapGithubPr({ number: 1, headRefName: "b", state: "OPEN", reviewDecision: "CHANGES_REQUESTED" })
        ?.reviewDecision
    ).toBe("changes_requested");
  });

  it("returns null when required fields are missing", () => {
    expect(mapGithubPr(null)).toBeNull();
    expect(mapGithubPr({})).toBeNull();
    expect(mapGithubPr({ number: 1 })).toBeNull();
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "NOT_A_STATE" })).toBeNull();
  });

  it("defaults unknown mergeable values to unknown", () => {
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "OPEN", mergeable: "WEIRD" })?.mergeable).toBe(
      "unknown"
    );
    expect(mapGithubPr({ number: 1, headRefName: "b", state: "OPEN" })?.mergeable).toBe("unknown");
  });
});

describe("mapGithubPrList", () => {
  it("maps lists and drops invalid entries", () => {
    const result = mapGithubPrList([
      { number: 1, headRefName: "a", state: "OPEN" },
      { garbage: true },
      { number: 2, headRefName: "b", state: "MERGED" },
    ]);
    expect(result.map((pr) => pr.number)).toEqual([1, 2]);
  });

  it("returns empty list for non-array input", () => {
    expect(mapGithubPrList(null)).toEqual([]);
    expect(mapGithubPrList("nope")).toEqual([]);
  });
});

describe("parseGithubRemote", () => {
  it("parses https URLs with and without .git suffix", () => {
    expect(parseGithubRemote("https://github.com/ogpoyraz/wtx.git")).toEqual({
      host: "github.com",
      owner: "ogpoyraz",
      name: "wtx",
    });
    expect(parseGithubRemote("https://github.com/ogpoyraz/wtx")).toEqual({
      host: "github.com",
      owner: "ogpoyraz",
      name: "wtx",
    });
  });

  it("parses scp-style ssh URLs", () => {
    expect(parseGithubRemote("git@github.com:ogpoyraz/wtx.git")).toEqual({
      host: "github.com",
      owner: "ogpoyraz",
      name: "wtx",
    });
  });

  it("parses enterprise hosts so forge=auto can gate on them", () => {
    expect(parseGithubRemote("git@ghe.corp.dev:team/repo.git")?.host).toBe("ghe.corp.dev");
    expect(parseGithubRemote("ssh://git@gitlab.company.com/group/repo.git")?.host).toBe(
      "gitlab.company.com"
    );
  });

  it("returns null for unparsable remotes", () => {
    expect(parseGithubRemote("/local/path/only")).toBeNull();
    expect(parseGithubRemote("")).toBeNull();
  });
});

describe("mapPrHead", () => {
  it("maps a complete gh pr head payload", () => {
    const raw = {
      number: 42,
      title: "feat: something",
      url: "https://github.com/ogp/r/pull/42",
      state: "OPEN",
      isDraft: false,
      headRefName: "ogp/feat",
      isCrossRepository: true,
      headRepositoryOwner: { login: "fork-owner" },
      headRepository: { name: "fork-repo" },
    };

    const result = mapPrHead(raw);
    expect(result).toEqual({
      number: 42,
      title: "feat: something",
      url: "https://github.com/ogp/r/pull/42",
      state: "open",
      isDraft: false,
      headRefName: "ogp/feat",
      isCrossRepository: true,
      headOwnerLogin: "fork-owner",
      headRepoName: "fork-repo",
    });
  });

  it("normalizes state", () => {
    expect(mapPrHead({ number: 1, headRefName: "x", state: "MERGED" })?.state).toBe("merged");
    expect(mapPrHead({ number: 1, headRefName: "x", state: "CLOSED" })?.state).toBe("closed");
  });

  it("handles same-repo PRs with missing fork fields", () => {
    const raw = {
      number: 42,
      title: "x",
      url: "y",
      state: "OPEN",
      isDraft: false,
      headRefName: "branch",
      isCrossRepository: false,
    };
    
    expect(mapPrHead(raw)).toEqual(expect.objectContaining({
      isCrossRepository: false,
      headOwnerLogin: null,
      headRepoName: null,
    }));
  });

  it("returns null for missing required fields", () => {
    expect(mapPrHead(null)).toBeNull();
    expect(mapPrHead({})).toBeNull();
    expect(mapPrHead({ number: 1, headRefName: "x" })).toBeNull();
    expect(mapPrHead({ number: 1, state: "OPEN" })).toBeNull();
  });
});

describe("descriptor.parseRemote", () => {
  const descriptor = descriptorFor("github")!;

  it("parses https URLs with and without .git suffix", () => {
    expect(descriptor.parseRemote("https://github.com/ogpoyraz/wtx.git")).toEqual({
      host: "github.com",
      path: "ogpoyraz/wtx",
    });
  });

  it("parses scp-style ssh URLs", () => {
    expect(descriptor.parseRemote("git@github.com:ogpoyraz/wtx.git")).toEqual({
      host: "github.com",
      path: "ogpoyraz/wtx",
    });
  });

  it("preserves alias hosts", () => {
    expect(descriptor.parseRemote("git@ghe.corp.dev:team/repo.git")).toEqual({
      host: "ghe.corp.dev",
      path: "team/repo",
    });
  });
});

describe("descriptor.ownsHost", () => {
  const descriptor = descriptorFor("github")!;
  
  it("owns github.com", () => {
    expect(descriptor.ownsHost("github.com")).toBe(true);
    expect(descriptor.ownsHost("GitHub.com")).toBe(true);
  });
  
  it("does not own other hosts", () => {
    expect(descriptor.ownsHost("gitlab.com")).toBe(false);
    expect(descriptor.ownsHost("bitbucket.org")).toBe(false);
    expect(descriptor.ownsHost("github.company.com")).toBe(false);
  });
});

describe("buildHeadFetch", () => {
  const adapter = createGithubAdapter({ owner: "o", name: "r" });

  it("builds same-repo fetch spec", () => {
    const pr = {
      number: 42,
      title: "",
      url: "",
      state: "open" as const,
      isDraft: false,
      headRefName: "feat",
      isCrossRepository: false,
      headOwnerLogin: null,
      headRepoName: null,
    };
    
    expect(adapter.buildHeadFetch(pr)).toEqual({
      url: null,
      refspec: "pull/42/head",
    });
  });

  it("builds cross-repo fetch spec", () => {
    const pr = {
      number: 42,
      title: "",
      url: "",
      state: "open" as const,
      isDraft: false,
      headRefName: "feat",
      isCrossRepository: true,
      headOwnerLogin: "fork",
      headRepoName: "repo",
    };
    
    expect(adapter.buildHeadFetch(pr)).toEqual({
      url: "https://github.com/fork/repo.git",
      refspec: "feat",
    });
  });

  it("throws when cross-repo is true but fields are missing", () => {
    const pr = {
      number: 42,
      title: "",
      url: "",
      state: "open" as const,
      isDraft: false,
      headRefName: "feat",
      isCrossRepository: true,
      headOwnerLogin: null,
      headRepoName: null,
    };
    
    expect(() => adapter.buildHeadFetch(pr)).toThrow("Cannot locate fork repository for PR");
  });
});

describe("validateSafeBranchName", () => {
  it("accepts valid branch names", () => {
    expect(validateSafeBranchName("ogp/fix-token")).toBe(true);
    expect(validateSafeBranchName("patch-1")).toBe(true);
    expect(validateSafeBranchName("feat/my.feature")).toBe(true);
  });

  it("rejects invalid branch names", () => {
    expect(validateSafeBranchName("-dash")).toBe(false);
    expect(validateSafeBranchName("a..b")).toBe(false);
    expect(validateSafeBranchName("has space")).toBe(false);
    expect(validateSafeBranchName("HEAD")).toBe(false);
    expect(validateSafeBranchName("")).toBe(false);
  });
});

describe("localBranchExists dryRun", () => {
  it("returns false in dryRun without executing", async () => {
    const result = await localBranchExists("some-path", "feat", { dryRun: true, verbose: false });
    expect(result).toBe(false);
  });
});
