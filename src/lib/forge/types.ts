export type PrState = "open" | "merged" | "closed";
export type Mergeable = "clean" | "conflicting" | "unknown";

export interface PrChecks {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface PrInfo {
  number: number;
  authorLogin: string | null;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  mergeable: Mergeable;
  checks: PrChecks;
  reviewDecision: "approved" | "changes_requested" | null;
  unresolvedThreads: number;
  updatedAt: string;
}

export const PR_DISPLAY_STATES = {
  MERGED: "MERGED",
  CLOSED: "CLOSED",
  DRAFT: "DRAFT",
  CONFLICTED: "CONFLICTED",
  CI_FAILING: "CI_FAILING",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  CI_RUNNING: "CI_RUNNING",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  AWAITING_REVIEW: "AWAITING_REVIEW",
} as const;

export type PrDisplayState = (typeof PR_DISPLAY_STATES)[keyof typeof PR_DISPLAY_STATES];

export interface PrDisplay {
  primary: PrDisplayState;
  awaitingReview: boolean;
  approved: boolean;
}

const DISPLAY_PRIORITY: PrDisplayState[] = [
  PR_DISPLAY_STATES.MERGED,
  PR_DISPLAY_STATES.CLOSED,
  PR_DISPLAY_STATES.DRAFT,
  PR_DISPLAY_STATES.CONFLICTED,
  PR_DISPLAY_STATES.CI_FAILING,
  PR_DISPLAY_STATES.CHANGES_REQUESTED,
  PR_DISPLAY_STATES.CI_RUNNING,
  PR_DISPLAY_STATES.IN_REVIEW,
  PR_DISPLAY_STATES.APPROVED,
  PR_DISPLAY_STATES.AWAITING_REVIEW,
];

export function displayStateRank(state: PrDisplayState): number {
  return DISPLAY_PRIORITY.indexOf(state);
}

export function derivePrDisplay(pr: PrInfo): PrDisplay {
  let primary: PrDisplayState;

  if (pr.state === "merged") {
    primary = PR_DISPLAY_STATES.MERGED;
  } else if (pr.state === "closed") {
    primary = PR_DISPLAY_STATES.CLOSED;
  } else if (pr.isDraft) {
    primary = PR_DISPLAY_STATES.DRAFT;
  } else if (pr.mergeable === "conflicting") {
    primary = PR_DISPLAY_STATES.CONFLICTED;
  } else if (pr.checks.failed > 0) {
    primary = PR_DISPLAY_STATES.CI_FAILING;
  } else if (pr.reviewDecision === "changes_requested") {
    primary = PR_DISPLAY_STATES.CHANGES_REQUESTED;
  } else if (pr.checks.pending > 0) {
    primary = PR_DISPLAY_STATES.CI_RUNNING;
  } else if (pr.unresolvedThreads > 0) {
    primary = PR_DISPLAY_STATES.IN_REVIEW;
  } else if (pr.reviewDecision === "approved") {
    primary = PR_DISPLAY_STATES.APPROVED;
  } else {
    primary = PR_DISPLAY_STATES.AWAITING_REVIEW;
  }

  const awaitingReview =
    pr.state === "open" &&
    !pr.isDraft &&
    pr.reviewDecision === null &&
    primary !== PR_DISPLAY_STATES.AWAITING_REVIEW;

  const approved =
    pr.reviewDecision === "approved" && primary !== PR_DISPLAY_STATES.APPROVED;

  return { primary, awaitingReview, approved };
}

export interface ForgeAdapterFetchContext {
  cwd: string;
  branches: string[];
  repoOverride?: string | null;
  verbose?: boolean;
}

export interface ForgeFetchOpts {
  cwd?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

export interface ForgeSlug {
  host: string;
  path: string;
}

export interface ForgePrLinkRef {
  forgeId: string;
  host: string;
  path: string;
  number: number;
  url: string;
}

export interface PrHead {
  number: number;
  title: string;
  url: string;
  state: "open" | "merged" | "closed";
  isDraft: boolean;
  headRefName: string;
  isCrossRepository: boolean;
  headOwnerLogin: string | null;
  headRepoName: string | null;
}

export interface ForgeDescriptor {
  id: string;
  ownsHost(host: string): boolean;
  parsePrLink(link: string): ForgePrLinkRef | null;
  parseRemote(url: string): ForgeSlug | null;
  createAdapter(slug: ForgeSlug): ForgeAdapter | null;
}

export interface ForgeAdapter {
  id: string;
  findForBranches(ctx: ForgeAdapterFetchContext): Promise<Map<string, PrInfo>>;
  fetchPrHead(number: number, opts?: ForgeFetchOpts): Promise<PrHead>;
  buildHeadFetch(pr: PrHead): { url: string | null; refspec: string };
}
