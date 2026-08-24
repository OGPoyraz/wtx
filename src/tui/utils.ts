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

export function computeScrollWindow(
  selectedIndex: number,
  currentStart: number,
  visibleRows: number,
  totalRows: number
): { start: number; end: number } {
  if (totalRows === 0) return { start: 0, end: 0 };
  
  let start = currentStart;
  
  const maxStart = Math.max(0, totalRows - visibleRows);
  if (start > maxStart) {
    start = maxStart;
  }
  
  if (selectedIndex < start) {
    start = selectedIndex;
  } else if (selectedIndex >= start + visibleRows) {
    start = selectedIndex - visibleRows + 1;
  }
  
  const end = Math.min(start + visibleRows, totalRows);
  return { start, end };
}


