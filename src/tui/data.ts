import { Semaphore } from "../lib/semaphore.js";
import { getWorktreeList, getDirtyFiles, detectInProgressRebase, gitExec, resolveCommitSha } from "../lib/git.js";
import { resolveRepos, resolveMainBranch } from "../lib/resolver.js";
import { loadConfig } from "../lib/config.js";
import { detectDepsState } from "../lib/deps.js";
import { resolveForge } from "../lib/forge/index.js";
import { resolveOwnership } from "../lib/owner.js";
import { derivePrDisplay } from "../lib/forge/types.js";
import type { GlobalOptions, Config, RepoContext } from "../types.js";
import type { WorktreeRow } from "./types.js";
import type { ForgeAdapter, PrInfo } from "../lib/forge/types.js";
import { readStackMetadata, type StackMetadata } from "../lib/stack.js";

export interface DataWarning {
  repoName: string;
  message: string;
}

export interface TuiDataResult {
  rows: WorktreeRow[];
  warnings: DataWarning[];
  streamPrData: (onUpdate: (update: TuiPrDataUpdate) => void) => Promise<void>;
}

export interface TuiPrDataUpdate {
  repoName: string;
  rows: WorktreeRow[];
  warnings: DataWarning[];
}

const PR_CACHE_TTL_MS = 5 * 60 * 1000;
const PR_CACHE_MAX_ENTRIES = 500;

interface PrCacheEntry {
  data: PrInfo;
  timestamp: number;
}

const prCache = new Map<string, PrCacheEntry>();

export function clearPrCacheForTests(): void {
  prCache.clear();
}

function prunePrCache(): void {
  while (prCache.size > PR_CACHE_MAX_ENTRIES) {
    const oldest = prCache.keys().next().value as string | undefined;
    if (!oldest) break;
    prCache.delete(oldest);
  }
}

function cachePrInfo(key: string, pr: PrInfo): void {
  prCache.set(key, { data: pr, timestamp: Date.now() });
  prunePrCache();
}

function getCachedPrInfo(key: string): PrInfo | null {
  const entry = prCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= PR_CACHE_TTL_MS) {
    prCache.delete(key);
    return null;
  }
  return entry.data;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function writePrFields(row: WorktreeRow, pr: PrInfo | undefined): WorktreeRow {
  const next: WorktreeRow = {
    ...row,
    prNumber: null,
    prState: null,
    prChecks: null,
    prUrl: null,
  };

  if (!pr) return next;

  next.prNumber = pr.number;
  next.prUrl = pr.url;
  const display = derivePrDisplay(pr);
  next.prState = display.primary;
  if (pr.checks.total > 0) {
    next.prChecks = `${pr.checks.passed}/${pr.checks.total}`;
  }
  if (pr.unresolvedThreads > 0) {
    next.prChecks = (next.prChecks ? `${next.prChecks} · ` : "") + `${pr.unresolvedThreads} thread${pr.unresolvedThreads > 1 ? "s" : ""}`;
  }
  if (!next.base) {
    next.base = pr.baseRefName;
  }
  return next;
}

interface PrFetchJob {
  repo: RepoContext;
  forge: ForgeAdapter;
  mainBranch: string;
  rows: WorktreeRow[];
  branches: string[];
  stackMetadata: StackMetadata;
}

async function enrichRowWithPrData(
  row: WorktreeRow,
  repo: RepoContext,
  mainBranch: string,
  stackMetadata: StackMetadata,
  prMap: Map<string, PrInfo>,
  config: Config,
  opts: GlobalOptions
): Promise<WorktreeRow> {
  if (row.isMainCheckout || row.branch === "(detached)") {
    return { ...row, prState: null };
  }

  const pr = prMap.get(row.branch);
  const stackEntry = stackMetadata.branches[row.branch];
  const base = stackEntry?.baseRef ?? pr?.baseRefName;
  const comparisonBase = stackEntry?.explicit
    ? stackEntry.baseRef
    : pr?.baseRefName && pr.baseRefName !== mainBranch
      ? pr.baseRefName
      : `origin/${mainBranch}`;

  let next = writePrFields({ ...row, base }, pr);

  if (pr?.baseRefName && !stackEntry?.explicit) {
    try {
      const stdout = await gitExec(
        ["-C", row.path, "rev-list", "--left-right", "--count", `${comparisonBase}...HEAD`],
        { dryRun: opts.dryRun }
      );
      if (stdout) {
        const parts = stdout.trim().split(/\s+/);
        if (parts.length === 2) {
          next = {
            ...next,
            behind: parseInt(parts[0]!, 10),
            ahead: parseInt(parts[1]!, 10),
          };
        }
      }
    } catch {
      // keep the initially rendered comparison values
    }
  }

  if (config.user) {
    try {
      const owner = await resolveOwnership({
        configUser: config.user,
        mainPath: repo.mainPath,
        branch: row.branch,
        prAuthorLogin: pr?.authorLogin,
        verbose: opts.verbose,
      });
      next = { ...next, owner: owner && !owner.mine ? owner.author : null };
    } catch {
      // keep the initially rendered owner value
    }
  }

  return next;
}

async function fetchPrUpdateForRepo(
  job: PrFetchJob,
  config: Config,
  opts: GlobalOptions
): Promise<TuiPrDataUpdate> {
  const warnings: DataWarning[] = [];
  let prMap = new Map<string, PrInfo>();

  if (job.branches.length > 0) {
    try {
      prMap = await job.forge.findForBranches({ cwd: job.repo.mainPath, branches: job.branches, verbose: opts.verbose });
      for (const [br, pr] of prMap.entries()) {
        cachePrInfo(`${job.repo.name}/${br}`, pr);
      }
    } catch (err: unknown) {
      warnings.push({ repoName: job.repo.name, message: `PR lookup failed for ${job.repo.name}: ${errorMessage(err)}` });
      for (const br of job.branches) {
        const cached = getCachedPrInfo(`${job.repo.name}/${br}`);
        if (cached) {
          prMap.set(br, cached);
        }
      }
    }
  }

  const rows = await Promise.all(
    job.rows.map(row => enrichRowWithPrData(row, job.repo, job.mainBranch, job.stackMetadata, prMap, config, opts))
  );

  return { repoName: job.repo.name, rows, warnings };
}

export async function fetchWorktreeData(opts: GlobalOptions, scope?: string[]): Promise<TuiDataResult> {
  const warnings: DataWarning[] = [];
  const prFetchJobs: PrFetchJob[] = [];
  let config: Config;

  try {
    config = loadConfig();
  } catch (err: unknown) {
    throw new Error(`Failed to load config: ${errorMessage(err)}`);
  }

  let repos: RepoContext[];
  try {
    if (scope && scope.length > 0) {
      repos = resolveRepos(config, scope);
    } else {
      repos = resolveRepos(config, Object.keys(config.repos));
    }
  } catch (err: unknown) {
    throw new Error(`Failed to resolve repos: ${errorMessage(err)}`);
  }

  const semaphore = new Semaphore(4);
  const allRows: WorktreeRow[] = [];

  const processRepo = async (repo: RepoContext) => {
    await semaphore.acquire();
    const startRows = allRows.length;
    let mainBranch = config.default_main_branch;
    try {
      mainBranch = await resolveMainBranch(repo, config);
      const wts = await getWorktreeList(repo.mainPath);
      let stackMetadata: StackMetadata = { version: 1, branches: {} };
      try {
        stackMetadata = await readStackMetadata(repo.mainPath, opts);
      } catch (err: unknown) {
        warnings.push({ repoName: repo.name, message: errorMessage(err) });
      }

      const forge = resolveForge(repo);
      const branches = wts.map(w => w.branch).filter(Boolean);
      const prRows: WorktreeRow[] = [];

      for (const wt of wts) {
        if (wt.isBare) continue; // skip bare
        
        let branch = wt.branch;
        const isMainCheckout = wt.path === repo.mainPath;
        
        if (isMainCheckout && !branch) {
          branch = mainBranch;
        }

        const stackEntry = branch ? stackMetadata.branches[branch] : undefined;
        const base = stackEntry?.baseRef;
        const comparisonBase = stackEntry?.explicit
          ? stackEntry.baseRef
          : `origin/${mainBranch}`;

        const row: WorktreeRow = {
          repoName: repo.name,
          branch: branch || "(detached)",
          path: wt.path,
          commitShort: wt.commit ? wt.commit.substring(0, 7) : "",
          isMainCheckout,
          isLocked: wt.isLocked,
          isPrunable: wt.isPrunable,
          isBare: wt.isBare,
          dirtyFiles: [],
          ahead: null,
          behind: null,
          prNumber: null,
          prState: forge && branch && !isMainCheckout ? "FETCHING" : null,
          prChecks: null,
          prUrl: null,
          owner: null,
          rebaseStatus: null,
          depsStrategy: "none",
          base,
          baseChanged: false,
        };

        if (isMainCheckout) {
          allRows.push(row);
          continue;
        }

        // parallel non-main data gathering
        await Promise.allSettled([
          (async () => {
            row.dirtyFiles = await getDirtyFiles(wt.path);
          })(),
          (async () => {
            try {
              const stdout = await gitExec(
                ["-C", wt.path, "rev-list", "--left-right", "--count", `${comparisonBase}...HEAD`],
                { dryRun: opts.dryRun }
              );
              if (stdout) {
                const parts = stdout.trim().split(/\s+/);
                if (parts.length === 2) {
                  row.behind = parseInt(parts[0]!, 10);
                  row.ahead = parseInt(parts[1]!, 10);
                }
              }
            } catch {
              // ignore
            }
          })(),
          (async () => {
            if (!stackEntry?.explicit || opts.dryRun) return;
            try {
              const currentBaseSha = await resolveCommitSha(repo.mainPath, stackEntry.baseRef, opts);
              row.baseChanged = currentBaseSha !== stackEntry.baseSha;
            } catch {
              row.baseChanged = true;
            }
          })(),
          (async () => {
            row.rebaseStatus = detectInProgressRebase(wt.path);
          })(),
          (async () => {
            try {
              const deps = detectDepsState(wt.path, repo.mainPath);
              row.depsStrategy = deps.strategy;
            } catch {
              // ignore
            }
          })(),
          (async () => {
            if (branch && config.user) {
              try {
                const owner = await resolveOwnership({
                  configUser: config.user,
                  mainPath: repo.mainPath,
                  branch,
                  prAuthorLogin: null,
                  verbose: opts.verbose,
                });
                if (owner && !owner.mine) {
                  row.owner = owner.author;
                }
              } catch {
                // ignore
              }
            }
          })()
        ]);

        allRows.push(row);
        prRows.push(row);
      }

      if (forge && branches.length > 0) {
        prFetchJobs.push({ repo, forge, mainBranch, rows: prRows, branches, stackMetadata });
      }

      if (allRows.length === startRows) {
        allRows.push({
          repoName: repo.name,
          branch: mainBranch,
          path: repo.mainPath,
          commitShort: "",
          isMainCheckout: true,
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
          base: undefined,
          baseChanged: false,
        });
      }
    } catch (err: unknown) {
      warnings.push({ repoName: repo.name, message: `Failed to process repo ${repo.name}: ${errorMessage(err)}` });
      if (allRows.length === startRows) {
        allRows.push({
          repoName: repo.name,
          branch: mainBranch,
          path: repo.mainPath,
          commitShort: "",
          isMainCheckout: true,
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
          base: undefined,
          baseChanged: false,
        });
      }
    } finally {
      semaphore.release();
    }
  };

  await Promise.allSettled(repos.map(processRepo));

  return {
    rows: allRows,
    warnings,
    streamPrData: async (onUpdate) => {
      await Promise.allSettled(prFetchJobs.map(async (job) => {
        const update = await fetchPrUpdateForRepo(job, config, opts);
        onUpdate(update);
      }));
    },
  };
}
