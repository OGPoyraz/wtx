import { useState, useEffect, useCallback } from "react";
import { fetchWorktreeData } from "../data.js";
import type { GlobalOptions } from "../../types.js";
import type { WorktreeRow } from "../types.js";

export interface RepoBlock {
  repoName: string;
  rows: WorktreeRow[];
}

export function useWorktrees(opts: GlobalOptions) {
  const [blocks, setBlocks] = useState<RepoBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const data = await fetchWorktreeData(opts);
      
      const byRepo = new Map<string, WorktreeRow[]>();
      for (const row of data.rows) {
        let arr = byRepo.get(row.repoName);
        if (!arr) {
          arr = [];
          byRepo.set(row.repoName, arr);
        }
        arr.push(row);
      }

      const newBlocks: RepoBlock[] = [];
      for (const [repoName, rows] of byRepo.entries()) {
        rows.sort((a, b) => {
          if (a.isMainCheckout && !b.isMainCheckout) return -1;
          if (!a.isMainCheckout && b.isMainCheckout) return 1;
          return a.branch.localeCompare(b.branch);
        });
        newBlocks.push({ repoName, rows });
      }

      newBlocks.sort((a, b) => a.repoName.localeCompare(b.repoName));

      setBlocks(newBlocks);
      setWarnings(data.warnings);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [opts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { blocks, loading, error, warnings, lastRefreshed, refresh };
}
