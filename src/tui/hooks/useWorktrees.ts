import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWorktreeData } from "../data.js";
import type { DataWarning } from "../data.js";
import type { GlobalOptions } from "../../types.js";
import type { WorktreeRow } from "../types.js";
import { mergeBlocks, mergeWarnings, rowSort } from "../utils.js";

export interface RepoBlock {
  repoName: string;
  rows: WorktreeRow[];
}

export function useWorktrees(opts: GlobalOptions) {
  const [blocks, setBlocks] = useState<RepoBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DataWarning[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const seqRef = useRef(0);

  const refresh = useCallback(async (scope?: string[]) => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    setError(null);

    try {
      const data = await fetchWorktreeData(opts, scope);
      if (seq !== seqRef.current) return;

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
        rows.sort(rowSort);
        newBlocks.push({ repoName, rows });
      }

      const scopeSet = scope ? new Set(scope) : undefined;
      setBlocks(prev => mergeBlocks(prev, newBlocks, scopeSet));
      setWarnings(prev => mergeWarnings(prev, data.warnings, scopeSet));
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: any) {
      if (seq === seqRef.current) setError(err.message);
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [opts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { blocks, loading, refreshing, error, warnings, lastRefreshed, refresh };
}
