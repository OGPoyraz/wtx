import { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { RepoBlock } from "../types.js";
import type { WorktreeRow } from "../types.js";
import { tokens, truncateBranch } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";
import { openInBrowser } from "../platform.js";

export interface VerbIndicator {
  verb: string;
  running: boolean;
}

interface WorktreeTableProps {
  blocks: RepoBlock[];
  selectedIndex: number;
  selection?: Set<string>;
  frame: string;
  repoVerbs: Map<string, VerbIndicator>;
  rowVerbs: Map<string, VerbIndicator>;
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

function WorktreeItem({ row, isSelected, isMultiSelected, indicator, frame, id }: { row: WorktreeRow; isSelected: boolean; isMultiSelected: boolean; indicator?: VerbIndicator; frame: string; id?: string }) {
  const prTap = useTapHandler(() => {
    if (row.prUrl) void openInBrowser(row.prUrl);
  });

  const badge = indicator
    ? indicator.running
      ? { text: `${frame} ${indicator.verb}…`, fg: tokens.accent }
      : { text: `◌ ${indicator.verb}`, fg: tokens.dim }
    : row.isPendingCreate
      ? { text: `${frame} creating…`, fg: tokens.accent }
      : statusBadge(row);

  const disabled = indicator !== undefined || row.isPendingCreate === true;
  const primary = isSelected ? tokens.bright : disabled ? tokens.dim : tokens.fg;

  const divergence =
    row.ahead !== null && row.behind !== null && (row.ahead > 0 || row.behind > 0)
      ? ` · ↑${row.ahead} ↓${row.behind}`
      : "";

  const ownerSegment = row.owner ? ` · by ${row.owner}` : "";
  const baseSegment = row.base ? ` · base ${row.base}` : "";
  const rebaseSegment =
    !row.isMainCheckout && row.rebaseStatus && !row.isPrunable ? ` · ${row.rebaseStatus}` : "";
  const baseChangedSegment = row.baseChanged ? " · base moved" : "";
  const hierarchyPrefix = row.hierarchyPrefix ?? "";
  const secondaryIndent = " ".repeat(SECONDARY_INDENT.length + hierarchyPrefix.length);

  const secondary = [
    `${secondaryIndent}${row.commitShort}`,
    divergence,
    ownerSegment,
    baseSegment,
  ]
    .filter(Boolean)
    .join(" ")
    .trimEnd();

  return (
    <box
      id={id}
      flexDirection="column"
      backgroundColor={isSelected ? tokens.selectionBg : undefined}
      style={{ paddingRight: 1 }}
    >
      <text>
        <span fg={primary}>{isSelected ? "▸ " : "  "}</span>
        <span fg={tokens.accent}>{isMultiSelected ? "✓ " : "  "}</span>
        <span fg={tokens.dim}>{hierarchyPrefix}</span>
        <span fg={primary}>{truncateBranch(row.branch)}</span>
        <span fg={badge.fg}>{`  ${badge.text}`}</span>
      </text>
      <text {...(row.prUrl ? prTap : {})}>
        <span fg={tokens.dim}>{secondary}</span>
        {row.prNumber !== null && (
          <>
            <span fg={tokens.dim}>{secondary ? " · " : ""}</span>
            <span fg={tokens.accent}>{`#${row.prNumber}`}</span>
            {row.prState && <span fg={tokens.dim}>{` ${row.prState}`}</span>}
            {row.prChecks && <span fg={tokens.dim}>{` (${row.prChecks})`}</span>}
            {row.prUrl && <span fg={tokens.dim}> ↗</span>}
          </>
        )}
        {baseChangedSegment && <span fg={tokens.warning}>{baseChangedSegment}</span>}
        {rebaseSegment && <span fg={tokens.error}>{rebaseSegment}</span>}
      </text>
    </box>
  );
}

export function WorktreeTable({ blocks, selectedIndex, selection = new Set(), frame, repoVerbs, rowVerbs }: WorktreeTableProps) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);

  useEffect(() => {
    if (scrollRef.current?.scrollChildIntoView) {
      scrollRef.current.scrollChildIntoView("selected-row");
    }
  }, [selectedIndex]);

  let flatIndex = 0;

  return (
    <scrollbox
      ref={scrollRef}
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
        blocks.map((block) => {
          const repoIndicator = repoVerbs.get(block.repoName);
          return (
            <box key={block.repoName} flexDirection="column" style={{ marginBottom: 1 }}>
              <box style={{ marginTop: flatIndex === 0 ? 0 : 1 }}>
                <text>
                  <span fg={tokens.bright}>{block.repoName}</span>
                  {block.rows.length > 0 && (
                    <span fg={tokens.dim}>{` · ${block.rows.filter(r => !r.isPendingCreate).length}`}</span>
                  )}
                  {repoIndicator ? (
                    <span fg={repoIndicator.running ? tokens.accent : tokens.dim}>
                      {repoIndicator.running
                        ? `  ${frame} ${repoIndicator.verb}…`
                        : `  ◌ ${repoIndicator.verb}`}
                    </span>
                  ) : block.rows.length === 0 ? (
                    <span fg={tokens.accent}>{`  ${frame} refreshing…`}</span>
                  ) : null}
                </text>
              </box>

              {block.rows.map((row) => {
                const navigable = !row.isPendingCreate;
                const isSelected = navigable && flatIndex === selectedIndex;
                if (navigable) flatIndex++;
                return (
                  <WorktreeItem
                    key={row.path}
                    row={row}
                    isSelected={isSelected}
                    isMultiSelected={selection.has(row.path)}
                    indicator={rowVerbs.get(row.path)}
                    frame={frame}
                    id={isSelected ? "selected-row" : undefined}
                  />
                );
              })}
            </box>
          );
        })
      )}
    </scrollbox>
  );
}
