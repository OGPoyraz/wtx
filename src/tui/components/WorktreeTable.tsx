import type { RepoBlock } from "../hooks/useWorktrees.js";
import type { WorktreeRow } from "../types.js";
import { tokens, truncateBranch } from "../theme.js";

interface WorktreeTableProps {
  blocks: RepoBlock[];
  selectedIndex: number;
  selection?: Set<string>;
}

const SECONDARY_INDENT = "      ";

function statusBadge(row: WorktreeRow): { text: string; fg: string } {
  if (row.isMainCheckout) return { text: "[main]", fg: tokens.accent };
  if (row.isPrunable) return { text: "missing", fg: tokens.error };
  if (row.isLocked) return { text: "locked", fg: tokens.error };
  if (row.rebaseStatus) return { text: "rebasing", fg: tokens.warning };
  if (row.dirtyFiles.length > 0)
    return { text: `dirty (${row.dirtyFiles.length})`, fg: tokens.warning };
  return { text: "clean", fg: tokens.dim };
}

function WorktreeItem({ row, isSelected, isMultiSelected }: { row: WorktreeRow; isSelected: boolean; isMultiSelected: boolean }) {
  const badge = statusBadge(row);
  const primary = isSelected ? tokens.bright : tokens.fg;

  const divergence =
    row.ahead !== null && row.behind !== null && (row.ahead > 0 || row.behind > 0)
      ? ` · ↑${row.ahead} ↓${row.behind}`
      : "";

  const prSegment = row.prNumber
    ? [
        `· #${row.prNumber}`,
        row.prState ?? "",
        row.prChecks ? `(${row.prChecks})` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const ownerSegment = row.owner ? ` · by ${row.owner}` : "";
  const rebaseSegment =
    !row.isMainCheckout && row.rebaseStatus && !row.isPrunable ? ` · ${row.rebaseStatus}` : "";

  const secondary = [
    `${SECONDARY_INDENT}${row.commitShort}`,
    divergence,
    prSegment,
    ownerSegment,
  ]
    .filter(Boolean)
    .join(" ")
    .trimEnd();

  return (
    <box
      flexDirection="column"
      backgroundColor={isSelected ? tokens.selectionBg : undefined}
      style={{ paddingRight: 1 }}
    >
      <text>
        <span fg={primary}>{isSelected ? "▸ " : "  "}</span>
        <span fg={tokens.accent}>{isMultiSelected ? "✓ " : "  "}</span>
        <span fg={primary}>{truncateBranch(row.branch)}</span>
        <span fg={badge.fg}>{`  ${badge.text}`}</span>
      </text>
      <text>
        <span fg={tokens.dim}>{secondary}</span>
        {rebaseSegment && <span fg={tokens.error}>{rebaseSegment}</span>}
      </text>
    </box>
  );
}

export function WorktreeTable({ blocks, selectedIndex, selection = new Set() }: WorktreeTableProps) {
  let flatIndex = 0;

  return (
    <scrollbox
      id="worktree-table"
      flexGrow={2}
      height="100%"
      border={true}
      borderColor={tokens.border}
      title="Worktrees"
      paddingX={1}
      focused={false}
    >
      {blocks.length === 0 ? (
        <text fg={tokens.dim}>No repositories configured.</text>
      ) : (
        blocks.map((block) => (
          <box key={block.repoName} flexDirection="column" style={{ marginBottom: 1 }}>
            <box style={{ marginTop: flatIndex === 0 ? 0 : 1 }}>
              <text>
                <span fg={tokens.bright}>{block.repoName}</span>
                <span fg={tokens.dim}>{` · ${block.rows.length}`}</span>
              </text>
            </box>

            {block.rows.map((row) => {
              const isSelected = flatIndex === selectedIndex;
              flatIndex++;
              return <WorktreeItem key={row.path} row={row} isSelected={isSelected} isMultiSelected={selection.has(row.path)} />;
            })}
          </box>
        ))
      )}
    </scrollbox>
  );
}
