import type { WorktreeRow } from "./types.js";

export function matchesFilter(entry: WorktreeRow, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  
  if (entry.branch.toLowerCase().includes(lower)) return true;
  if (entry.repoName.toLowerCase().includes(lower)) return true;
  if (entry.prNumber?.toString().includes(lower)) return true;
  if (entry.owner?.toLowerCase().includes(lower)) return true;
  if (entry.prState?.toLowerCase().includes(lower)) return true;
  if (entry.prUrl?.toLowerCase().includes(lower)) return true;
  
  return false;
}

export function toggleSelection(current: Set<string>, path: string): Set<string> {
  const next = new Set(current);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}
