import { Semaphore } from "../lib/semaphore.js";
import { getWorktreeList, getDirtyFiles, detectInProgressRebase, gitExec } from "../lib/git.js";
import { resolveRepos, resolveMainBranch } from "../lib/resolver.js";
import { loadConfig } from "../lib/config.js";
import { detectDepsState } from "../lib/deps.js";
import { resolveForge } from "../lib/forge/index.js";
import { resolveOwnership } from "../lib/owner.js";
import { derivePrDisplay } from "../lib/forge/types.js";
import type { GlobalOptions, Config, RepoContext } from "../types.js";
import type { WorktreeRow } from "./types.js";
import type { PrInfo } from "../lib/forge/types.js";

export interface DataWarning {
  repoName: string;
  message: string;
}

export interface TuiDataResult {
  rows: WorktreeRow[];
  warnings: DataWarning[];
}

const prCache = new Map<string, PrInfo>();

export async function fetchWorktreeData(opts: GlobalOptions, scope?: string[]): Promise<TuiDataResult> {
  const warnings: DataWarning[] = [];
  let config: Config;

  try {
    config = loadConfig();
  } catch (err: any) {
    throw new Error(`Failed to load config: ${err.message}`);
  }

  let repos: RepoContext[];
  try {
    repos = resolveRepos(config);
  } catch (err: any) {
    throw new Error(`Failed to resolve repos: ${err.message}`);
  }

  if (scope) {
    const scopeSet = new Set(scope);
    repos = repos.filter(r => scopeSet.has(r.name));
  }

  const semaphore = new Semaphore(4);
  const allRows: WorktreeRow[] = [];

  const processRepo = async (repo: RepoContext) => {
    await semaphore.acquire();
    try {
      const mainBranch = await resolveMainBranch(repo, config);
      const wts = await getWorktreeList(repo.mainPath);
      
      const forge = resolveForge(repo);
      const branches = wts.map(w => w.branch).filter(Boolean);
      
      let prMap = new Map<string, PrInfo>();
      if (forge && branches.length > 0) {
        try {
          prMap = await forge.findForBranches({ cwd: repo.mainPath, branches, verbose: opts.verbose });
          for (const [br, pr] of prMap.entries()) {
            prCache.set(`${repo.name}/${br}`, pr);
          }
        } catch (err: any) {
          warnings.push({ repoName: repo.name, message: `PR lookup failed for ${repo.name}: ${err.message}` });
          // use cache fallback
          for (const br of branches) {
            const cached = prCache.get(`${repo.name}/${br}`);
            if (cached) {
              prMap.set(br, cached);
            }
          }
        }
      }

      for (const wt of wts) {
        if (wt.isBare) continue; // skip bare
        
        let branch = wt.branch;
        const isMainCheckout = wt.path === repo.mainPath;
        
        if (isMainCheckout && !branch) {
          branch = mainBranch;
        }

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
          prState: null,
          prChecks: null,
          prUrl: null,
          owner: null,
          rebaseStatus: null,
          depsStrategy: "none",
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
                ["-C", wt.path, "rev-list", "--left-right", "--count", `origin/${mainBranch}...HEAD`],
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
              const pr = prMap.get(branch);
              try {
                const owner = await resolveOwnership({
                  configUser: config.user,
                  mainPath: repo.mainPath,
                  branch,
                  prAuthorLogin: pr?.authorLogin,
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

        if (branch) {
          const pr = prMap.get(branch);
          if (pr) {
            row.prNumber = pr.number;
            row.prUrl = pr.url;
            const display = derivePrDisplay(pr);
            row.prState = display.primary;
            if (pr.checks.total > 0) {
              row.prChecks = `${pr.checks.passed}/${pr.checks.total}`;
            }
            if (pr.unresolvedThreads > 0) {
              row.prChecks = (row.prChecks ? `${row.prChecks} · ` : "") + `${pr.unresolvedThreads} thread${pr.unresolvedThreads > 1 ? "s" : ""}`;
            }
          }
        }

        allRows.push(row);
      }
    } catch (err: any) {
      warnings.push({ repoName: repo.name, message: `Failed to process repo ${repo.name}: ${err.message}` });
    } finally {
      semaphore.release();
    }
  };

  await Promise.allSettled(repos.map(processRepo));

  return {
    rows: allRows,
    warnings,
  };
}
