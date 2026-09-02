import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWorktreeData } from "../data.js";
import type { DataWarning, TuiDataResult } from "../data.js";
import { loadConfig } from "../../lib/config.js";
import type { GlobalOptions } from "../../types.js";
import type { RepoBlock, WorktreeRow } from "../types.js";
import { mergeBlocks, mergeWarnings, sortRowsHierarchically } from "../utils.js";

function initialPendingRepos(): string[] {
  try {
    const config = loadConfig();
    return Object.keys(config.repos).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function loadFavorites(): string[] {
  try {
    return loadConfig().favorites;
  } catch {
    return [];
  }
}

function blocksFromData(data: TuiDataResult): RepoBlock[] {
  const byRepo = new Map<string, WorktreeRow[]>();
  for (const row of data.rows) {
    let arr = byRepo.get(row.repoName);
    if (!arr) {
      arr = [];
      byRepo.set(row.repoName, arr);
    }
    arr.push(row);
  }

  const blocks: RepoBlock[] = [];
  for (const [repoName, rows] of byRepo.entries()) {
    blocks.push({ repoName, rows: sortRowsHierarchically(rows) });
  }
  blocks.sort((a, b) => a.repoName.localeCompare(b.repoName));
  return blocks;
}

export function useWorktrees(opts: GlobalOptions) {
  const [blocks, setBlocks] = useState<RepoBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DataWarning[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [pendingRepos, setPendingRepos] = useState<string[]>(initialPendingRepos);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const seqRef = useRef(0);

  const refresh = useCallback(async (scope?: string[]) => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    setError(null);

    try {
      const data = await fetchWorktreeData(opts, scope);
      if (seq !== seqRef.current) return;

      const scopeSet = scope ? new Set(scope) : undefined;
      const currentFavorites = loadFavorites();
      setFavorites(currentFavorites);
      setBlocks(prev => mergeBlocks(prev, blocksFromData(data), scopeSet, currentFavorites));
      setWarnings(prev => mergeWarnings(prev, data.warnings, scopeSet));
      setLastRefreshed(new Date().toLocaleTimeString());
      void data.streamPrData((update) => {
        if (seq !== seqRef.current) return;
        const updateScope = new Set([update.repoName]);
        const nextFavorites = loadFavorites();
        setFavorites(nextFavorites);
        setBlocks(prev => mergeBlocks(
          prev,
          [{ repoName: update.repoName, rows: sortRowsHierarchically(update.rows) }],
          updateScope,
          nextFavorites
        ));
        setWarnings(prev => mergeWarnings(prev, update.warnings, updateScope));
      });
    } catch (err: any) {
      if (seq === seqRef.current) setError(err.message);
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
        if (!scope) setPendingRepos([]);
      }
    }
  }, [opts]);

  const clearWarnings = useCallback(() => setWarnings([]), []);

  const applyFavorites = useCallback((next: string[]) => {
    setFavorites(next);
    setBlocks(prev => mergeBlocks([], prev, undefined, next));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { blocks, loading, refreshing, error, warnings, lastRefreshed, pendingRepos, favorites, refresh, clearWarnings, applyFavorites };
}
