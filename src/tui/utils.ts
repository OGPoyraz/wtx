import type { WorktreeRow, RepoBlock } from "./types.js";
import type { DataWarning } from "./data.js";
import { buildStackHierarchy } from "../lib/stack.js";

export function matchesFilter(entry: WorktreeRow, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  
  if (entry.branch.toLowerCase().includes(lower)) return true;
  if (entry.repoName.toLowerCase().includes(lower)) return true;
  if (entry.prNumber?.toString().includes(lower)) return true;
  if (entry.owner?.toLowerCase().includes(lower)) return true;
  if (entry.prState?.toLowerCase().includes(lower)) return true;
  if (entry.prUrl?.toLowerCase().includes(lower)) return true;
  if (entry.base?.toLowerCase().includes(lower)) return true;
  
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

export function rowSort(a: WorktreeRow, b: WorktreeRow): number {
  if (a.isMainCheckout && !b.isMainCheckout) return -1;
  if (!a.isMainCheckout && b.isMainCheckout) return 1;
  return a.branch.localeCompare(b.branch);
}

export function sortRowsHierarchically(rows: WorktreeRow[]): WorktreeRow[] {
  return buildStackHierarchy(
    rows,
    (row) => row.branch,
    (row) => row.base,
    rowSort
  ).map(({ item, depth, prefix }) => ({
    ...item,
    hierarchyDepth: depth,
    hierarchyPrefix: prefix,
  }));
}

export function sortBlocks(blocks: RepoBlock[]): RepoBlock[] {
  return [...blocks].sort((a, b) => a.repoName.localeCompare(b.repoName));
}

export function mergeBlocks(prev: RepoBlock[], next: RepoBlock[], scope?: Set<string>): RepoBlock[] {
  if (!scope) return sortBlocks(next);
  const kept = prev.filter(b => !scope.has(b.repoName));
  return sortBlocks([...kept, ...next]);
}

export function mergeWarnings(prev: DataWarning[], next: DataWarning[], scope?: Set<string>): DataWarning[] {
  if (!scope) return next;
  const kept = prev.filter(w => !scope.has(w.repoName));
  return [...kept, ...next];
}

export function makePlaceholderRow(repoName: string, branch: string): WorktreeRow {
  return {
    repoName,
    branch,
    path: `pending-create:${repoName}:${branch}`,
    commitShort: "",
    isMainCheckout: false,
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
    isPendingCreate: true,
  };
}

export function withCreatePlaceholders(
  blocks: RepoBlock[],
  creating: { repoName: string; branch: string }[]
): RepoBlock[] {
  if (creating.length === 0) return blocks;

  const byRepo = new Map<string, string[]>();
  for (const c of creating) {
    const arr = byRepo.get(c.repoName);
    if (arr) {
      arr.push(c.branch);
    } else {
      byRepo.set(c.repoName, [c.branch]);
    }
  }

  return blocks.map(block => {
    const branches = byRepo.get(block.repoName);
    if (!branches) return block;
    const placeholders = branches.map(br => makePlaceholderRow(block.repoName, br));
    return { ...block, rows: sortRowsHierarchically([...block.rows, ...placeholders]) };
  });
}
