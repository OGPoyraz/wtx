import type { Mergeable, PrChecks, PrInfo, PrState } from "./types.js";

interface RawCheckItem {
  __typename?: string;
  status?: string | null;
  conclusion?: string | null;
  state?: string | null;
  commit?: {
    statusCheckRollup?: {
      contexts?: { nodes?: unknown[] } | null;
    } | null;
  } | null;
}

const FAILED_CHECK_CONCLUSIONS = new Set([
  "FAILURE",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);

const IGNORED_CHECK_CONCLUSIONS = new Set(["NEUTRAL", "SKIPPED"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCheckItem(value: unknown): RawCheckItem | null {
  if (!isRecord(value)) return null;
  return {
    __typename: typeof value.__typename === "string" ? value.__typename : undefined,
    status: typeof value.status === "string" ? value.status : null,
    conclusion: typeof value.conclusion === "string" ? value.conclusion : null,
    state: typeof value.state === "string" ? value.state : null,
    commit: isRecord(value.commit) ? (value.commit as RawCheckItem["commit"]) : null,
  };
}

export function collectCheckItems(raw: unknown): RawCheckItem[] {
  if (!Array.isArray(raw)) return [];

  const items: RawCheckItem[] = [];
  for (const entry of raw) {
    const item = asCheckItem(entry);
    if (!item) continue;

    if (item.commit?.statusCheckRollup?.contexts?.nodes) {
      for (const nested of item.commit.statusCheckRollup.contexts.nodes) {
        const nestedItem = asCheckItem(nested);
        if (nestedItem) items.push(nestedItem);
      }
      continue;
    }

    items.push(item);
  }

  return items;
}

export function bucketChecks(items: RawCheckItem[]): PrChecks {
  let passed = 0;
  let failed = 0;
  let pending = 0;

  for (const item of items) {
    const isStatusContext = item.__typename === "StatusContext";

    if (isStatusContext) {
      if (item.state === "SUCCESS") passed++;
      else if (item.state === "ERROR" || item.state === "FAILURE") failed++;
      else pending++;
      continue;
    }

    const conclusion = item.conclusion ?? null;
    if (conclusion === "SUCCESS") passed++;
    else if (conclusion && FAILED_CHECK_CONCLUSIONS.has(conclusion)) failed++;
    else if (conclusion && IGNORED_CHECK_CONCLUSIONS.has(conclusion)) continue;
    else pending++;
  }

  return { total: passed + failed + pending, passed, failed, pending };
}

function mapState(raw: unknown): PrState | null {
  if (raw === "OPEN") return "open";
  if (raw === "MERGED") return "merged";
  if (raw === "CLOSED") return "closed";
  return null;
}

function mapMergeable(raw: unknown): Mergeable {
  if (raw === "MERGEABLE") return "clean";
  if (raw === "CONFLICTING") return "conflicting";
  return "unknown";
}

function mapReviewDecision(raw: unknown): PrInfo["reviewDecision"] {
  if (raw === "APPROVED") return "approved";
  if (raw === "CHANGES_REQUESTED") return "changes_requested";
  return null;
}

export function mapGithubPr(raw: unknown): PrInfo | null {
  if (!isRecord(raw)) return null;

  const number = typeof raw.number === "number" ? raw.number : null;
  const headRefName = typeof raw.headRefName === "string" ? raw.headRefName : null;
  const state = mapState(raw.state);

  if (number === null || headRefName === null || state === null) return null;

  const title = typeof raw.title === "string" ? raw.title : "";
  const url = typeof raw.url === "string" ? raw.url : "";
  const isDraft = raw.isDraft === true;
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";

  const checks = bucketChecks(collectCheckItems(raw.statusCheckRollup));

  return {
    number,
    title,
    url,
    state,
    isDraft,
    mergeable: mapMergeable(raw.mergeable),
    checks,
    reviewDecision: mapReviewDecision(raw.reviewDecision),
    unresolvedThreads: 0,
    updatedAt,
  };
}

export function mapGithubPrList(raw: unknown): PrInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapGithubPr).filter((pr): pr is PrInfo => pr !== null);
}
