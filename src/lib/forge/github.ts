import { execa } from "execa";
import { verbose } from "../log.js";
import { isRecord, mapGithubPr, mapPrHead } from "./map.js";
import type {
  ForgeAdapter,
  ForgeAdapterFetchContext,
  ForgeDescriptor,
  ForgeFetchOpts,
  ForgePrLinkRef,
  ForgeSlug,
  PrHead,
  PrInfo,
} from "./types.js";

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

interface ParsedRemote {
  host: string;
  owner: string;
  name: string;
}

const REMOTE_URL_PATTERNS = [
  /^https?:\/\/([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
  /^git@([^:]+):([^/]+)\/([^/.]+?)(?:\.git)?$/,
  /^ssh:\/\/git@([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
];

export function parseGithubRemote(url: string): ParsedRemote | null {
  for (const pattern of REMOTE_URL_PATTERNS) {
    const match = url.trim().match(pattern);
    if (match) {
      return { host: match[1]!, owner: match[2]!, name: match[3]! };
    }
  }
  return null;
}

export function parseGithubPrLink(link: string): ForgePrLinkRef | null {
  let urlStr = link.trim();
  urlStr = urlStr.replace(/#.*$/, "");
  urlStr = urlStr.replace(/\?.*$/, "");
  urlStr = urlStr.replace(/\/$/, "");

  const match = urlStr.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)$/);
  if (!match) return null;

  const [, host, owner, name, numberStr] = match;
  if (!host || !owner || !name || !numberStr) return null;

  return {
    forgeId: "github",
    host,
    path: `${owner}/${name}`.toLowerCase(),
    number: parseInt(numberStr, 10),
    url: urlStr,
  };
}

export function createGithubDescriptor(): ForgeDescriptor {
  return {
    id: "github",
    ownsHost(host: string): boolean {
      return host.toLowerCase() === "github.com";
    },
    parsePrLink(link: string): ForgePrLinkRef | null {
      return parseGithubPrLink(link);
    },
    parseRemote(url: string): ForgeSlug | null {
      const parsed = parseGithubRemote(url);
      if (!parsed) return null;
      return {
        host: parsed.host,
        path: `${parsed.owner}/${parsed.name}`.toLowerCase(),
      };
    },
    createAdapter(slug: ForgeSlug): ForgeAdapter | null {
      const parts = slug.path.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      return createGithubAdapter({ owner: parts[0], name: parts[1] });
    },
  };
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

    async fetchPrHead(number: number, opts: ForgeFetchOpts = {}): Promise<PrHead> {
      if (!slug) {
        throw new Error("Cannot fetch PR head without a repository context");
      }

      const args = [
        "pr",
        "view",
        String(number),
        "-R",
        `${slug.owner}/${slug.name}`,
        "--json",
        "number,title,url,state,isDraft,headRefName,isCrossRepository,headRepositoryOwner,headRepository",
      ];

      const stdout = await ghExec(args, opts);
      const parsed = parseJson(stdout);
      const prHead = mapPrHead(parsed);

      if (!prHead) {
        throw new Error(`PR #${number} not found in ${slug.owner}/${slug.name}`);
      }

      return prHead;
    },

    buildHeadFetch(pr: PrHead): { url: string | null; refspec: string } {
      if (pr.isCrossRepository) {
        if (!pr.headOwnerLogin || !pr.headRepoName) {
          throw new Error("Cannot locate fork repository for PR");
        }
        return {
          url: `https://github.com/${pr.headOwnerLogin}/${pr.headRepoName}.git`,
          refspec: pr.headRefName,
        };
      }
      return { url: null, refspec: `pull/${pr.number}/head` };
    },
  };
}
