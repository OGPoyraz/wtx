import { execa } from "execa";
import { verbose } from "../log.js";
import { isRecord, mapGithubPr } from "./map.js";
import type { ForgeAdapter, ForgeAdapterFetchContext, PrInfo } from "./types.js";

const PR_LIST_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "mergeable",
  "statusCheckRollup",
  "reviewDecision",
  "headRefName",
  "updatedAt",
].join(",");

const THREADS_PER_PR = 100;
const GH_TIMEOUT_MS = 10000;

export interface GithubSlug {
  owner: string;
  name: string;
}

export async function ghExec(
  args: string[],
  opts: { cwd?: string; verbose?: boolean; dryRun?: boolean } = {}
): Promise<string> {
  if (opts.verbose) {
    verbose(`gh ${args.join(" ")}${opts.cwd ? ` (cwd: ${opts.cwd})` : ""}`, true);
  }

  if (opts.dryRun) {
    return "";
  }

  try {
    const { stdout } = await execa("gh", args, {
      cwd: opts.cwd,
      timeout: GH_TIMEOUT_MS,
      reject: true,
    });
    return stdout;
  } catch (err: unknown) {
    const stderr =
      err !== null && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: unknown }).stderr ?? "")
        : "";
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`gh ${args[0]} failed: ${(stderr || message).trim()}`);
  }
}

interface BranchPr {
  branch: string;
  pr: PrInfo;
}

function mapWithBranch(raw: unknown): BranchPr | null {
  const pr = mapGithubPr(raw);
  if (!pr || !isRecord(raw) || typeof raw.headRefName !== "string") return null;
  return { branch: raw.headRefName, pr };
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function fetchOpenBranchPrs(ctx: ForgeAdapterFetchContext): Promise<BranchPr[]> {
  const results = await Promise.all(
    ctx.branches.map(async (branch) => {
      const args = [
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "open",
        "--limit",
        "1",
        "--json",
        PR_LIST_FIELDS,
      ];
      if (ctx.repoOverride) {
        args.push("-R", ctx.repoOverride);
      }

      const stdout = await ghExec(args, { cwd: ctx.cwd, verbose: ctx.verbose });
      const parsed = parseJson(stdout);
      if (!Array.isArray(parsed)) return null;
      return mapWithBranch(parsed[0]);
    })
  );

  return results.filter((entry): entry is BranchPr => entry !== null);
}

function countUnresolvedThreads(result: unknown): number {
  if (!isRecord(result)) return 0;
  const threads = result.reviewThreads;
  if (!isRecord(threads) || !Array.isArray(threads.nodes)) return 0;
  return threads.nodes.filter((node) => isRecord(node) && node.isResolved === false).length;
}

function buildThreadQuery(numbers: number[]): string {
  const aliases = numbers
    .map(
      (n, i) =>
        `pr${i}: pullRequest(number: ${n}) { reviewThreads(first: ${THREADS_PER_PR}) { nodes { isResolved } } }`
    )
    .join(" ");
  return `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${aliases} } }`;
}

async function enrichUnresolvedThreads(
  slug: GithubSlug,
  prs: PrInfo[],
  verboseFlag?: boolean
): Promise<void> {
  if (prs.length === 0) return;

  const query = buildThreadQuery(prs.map((pr) => pr.number));
  const stdout = await ghExec(
    [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `owner=${slug.owner}`,
      "-f",
      `name=${slug.name}`,
    ],
    { verbose: verboseFlag }
  );

  const payload = parseJson(stdout);
  if (!isRecord(payload) || !isRecord(payload.data)) return;

  const repoData = payload.data.repository;
  if (!isRecord(repoData)) return;

  prs.forEach((pr, i) => {
    pr.unresolvedThreads = countUnresolvedThreads(repoData[`pr${i}`]);
  });
}

export function createGithubAdapter(slug: GithubSlug | null): ForgeAdapter {
  return {
    id: "github",

    async findForBranches(ctx: ForgeAdapterFetchContext): Promise<Map<string, PrInfo>> {
      const entries = await fetchOpenBranchPrs(ctx);

      if (slug && entries.length > 0) {
        await enrichUnresolvedThreads(
          slug,
          entries.map((entry) => entry.pr),
          ctx.verbose
        ).catch(() => undefined);
      }

      return new Map(entries.map((entry) => [entry.branch, entry.pr]));
    },
  };
}
