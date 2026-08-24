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

export function buildRowCopyText(row: WorktreeRow): string {
  const parts = [
    row.branch,
    row.repoName,
    row.path,
    row.commitShort || "",
    `dirty:${row.dirtyFiles.length}`,
  ];
  if (row.prNumber) {
    parts.push(`pr:#${row.prNumber} ${row.prState || ""}`.trim());
  }
  return parts.join("\t");
}

export function pickClipboardCmd(platform: string, env: Record<string, string | undefined>): string[][] {
  if (env.WTX_CLIPBOARD_CMD) {
    return [env.WTX_CLIPBOARD_CMD.split(" ")];
  }
  if (platform === "darwin") return [["pbcopy"]];
  if (platform === "win32") return [["clip.exe"]];
  if (platform === "linux") {
    return [
      ["wl-copy"],
      ["xclip", "-selection", "clipboard"],
      ["xsel", "--clipboard", "--input"]
    ];
  }
  return [];
}
