import type { Worktree } from "./git.js";
import type { PrInfo } from "./forge/types.js";

export interface PruneCandidate {
  branch: string;
  path: string;
  prNumber: number;
}

export function selectMergedCandidates(
  worktrees: Worktree[],
  mainPath: string,
  prMap: Map<string, PrInfo>
): PruneCandidate[] {
  const candidates: PruneCandidate[] = [];

  for (const wt of worktrees) {
    if (wt.path === mainPath || !wt.branch) continue;
    const pr = prMap.get(wt.branch);
    if (pr && pr.state === "merged") {
      candidates.push({ branch: wt.branch, path: wt.path, prNumber: pr.number });
    }
  }

  return candidates;
}
