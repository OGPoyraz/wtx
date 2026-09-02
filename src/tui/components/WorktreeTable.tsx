import { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { RepoBlock } from "../types.js";
import type { WorktreeRow } from "../types.js";
import { truncateBranch } from "../theme.js";
import { useTheme } from "../theme.js";
import type { ThemeTokens } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";
import { openInBrowser } from "../platform.js";
import { workspaceMemberKey } from "../utils.js";

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
  favorites?: string[];
  workspaceMemberSet?: Set<string> | null;
  activeWorkspaceName?: string | null;
  onRowClick?: (index: number) => void;
  onToggleSelect?: (path: string) => void;
}

const SECONDARY_INDENT = "      ";

function statusBadge(row: WorktreeRow, theme: ThemeTokens): { text: string; fg: string } {
  if (row.isMainCheckout) return { text: "[main]", fg: theme.accent };
  if (row.isPrunable) return { text: "missing", fg: theme.error };
  if (row.isLocked) return { text: "locked", fg: theme.error };
  if (row.rebaseStatus) return { text: "rebasing", fg: theme.warning };
  if (row.dirtyFiles.length > 0)
    return { text: `dirty (${row.dirtyFiles.length})`, fg: theme.warning };
  return { text: "clean", fg: theme.dim };
}

function WorktreeItem({
  row,
  isSelected,
  isMultiSelected,
  indicator,
  frame,
  id,
  isWorkspaceMember,
  onRowClick,
  onToggleSelect,
}: {
  row: WorktreeRow;
  isSelected: boolean;
  isMultiSelected: boolean;
  indicator?: VerbIndicator;
  frame: string;
  id?: string;
  isWorkspaceMember?: boolean;
  onRowClick?: () => void;
  onToggleSelect?: () => void;
}) {
  const theme = useTheme();
  const prTap = useTapHandler(() => {
    if (row.prUrl) void openInBrowser(row.prUrl);
  });
  const rowTap = useTapHandler(() => {
    onRowClick?.();
  });
  const gutterTap = useTapHandler((e) => {
    e.stopPropagation();
    onToggleSelect?.();
  });

  const badge = indicator
    ? indicator.running
      ? { text: `${frame} ${indicator.verb}…`, fg: theme.accent }
      : { text: `◌ ${indicator.verb}`, fg: theme.dim }
    : row.isPendingCreate
      ? { text: `${frame} creating…`, fg: theme.accent }
      : statusBadge(row, theme);

  const disabled = indicator !== undefined || row.isPendingCreate === true;
  const primary = isSelected ? theme.bright : disabled ? theme.dim : theme.fg;

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

  const isClickable = !row.isPendingCreate && !indicator;

  return (
    <box
      id={id}
      flexDirection="column"
      backgroundColor={isSelected ? theme.selectionBg : undefined}
      style={{ paddingRight: 1 }}
      {...(isClickable && onRowClick ? rowTap : {})}
    >
      <box flexDirection="row">
        <text>
          <span fg={primary}>{isSelected ? "▸ " : "  "}</span>
        </text>
        <box width={2} {...(onToggleSelect ? gutterTap : {})}>
          <text fg={theme.accent}>{isMultiSelected ? "✓ " : "  "}</text>
        </box>
        <text>
          <span fg={theme.dim}>{hierarchyPrefix}</span>
          {isWorkspaceMember && <span fg={theme.accent}>{"⬡ "}</span>}
          <span fg={primary}>{truncateBranch(row.branch)}</span>
          <span fg={badge.fg}>{`  ${badge.text}`}</span>
        </text>
      </box>
      <box flexDirection="row">
        <text>
          <span fg={theme.dim}>{secondary}</span>
          {row.prNumber !== null && secondary ? <span fg={theme.dim}>{" · "}</span> : null}
        </text>
        {row.prNumber !== null && (
          <box {...(row.prUrl ? prTap : {})}>
            <text>
              <span fg={theme.accent}>{`#${row.prNumber}`}</span>
              {row.prState && <span fg={theme.dim}>{` ${row.prState}`}</span>}
              {row.prChecks && <span fg={theme.dim}>{` (${row.prChecks})`}</span>}
              {row.prUrl && <span fg={theme.dim}>{" ↗"}</span>}
            </text>
          </box>
        )}
        {row.prNumber === null && row.prState === "FETCHING" && (
          <text fg={theme.dim}>{secondary ? " · " : ""}PR …</text>
        )}
        <text>
          {baseChangedSegment && <span fg={theme.warning}>{baseChangedSegment}</span>}
          {rebaseSegment && <span fg={theme.error}>{rebaseSegment}</span>}
        </text>
      </box>
    </box>
  );
}

export function WorktreeTable({ blocks, selectedIndex, selection = new Set(), frame, repoVerbs, rowVerbs, favorites = [], workspaceMemberSet = null, activeWorkspaceName = null, onRowClick, onToggleSelect }: WorktreeTableProps) {
  const theme = useTheme();
  const favoriteSet = new Set(favorites);
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);

  useEffect(() => {
    if (scrollRef.current?.scrollChildIntoView) {
      scrollRef.current.scrollChildIntoView("selected-row");
    }
  }, [selectedIndex]);

  const flatIndexMap = new Map<string, number>();
  let idx = 0;
  for (const b of blocks) {
    for (const r of b.rows) {
      if (!r.isPendingCreate) flatIndexMap.set(r.path, idx++);
    }
  }

  let headerSeen = 0;

  return (
    <scrollbox
      ref={scrollRef}
      id="worktree-table"
      flexGrow={1}
      width="100%"
      height="100%"
      border={true}
      borderColor={theme.border}
      focusedBorderColor={theme.border}
      focusable={false}
      title={activeWorkspaceName ? `Repositories · workspace: ${activeWorkspaceName}` : "Repositories"}
      paddingX={1}
      focused={false}
      onMouseScroll={(e) => {
        e.stopPropagation();
      }}
    >
      {blocks.length === 0 ? (
        <text fg={theme.dim}>No repositories configured.</text>
      ) : (
        blocks.map((block) => {
          const repoIndicator = repoVerbs.get(block.repoName);
          return (
            <box key={block.repoName} flexDirection="column" style={{ marginBottom: 1 }}>
              <box style={{ marginTop: headerSeen === 0 ? 0 : 1 }}>
                <text>
                  {favoriteSet.has(block.repoName) && <span fg={theme.accent}>{"★ "}</span>}
                  <span fg={theme.bright}>{block.repoName}</span>
                  {block.rows.length > 0 && (
                    <span fg={theme.dim}>{` · ${block.rows.filter(r => !r.isPendingCreate).length}`}</span>
                  )}
                  {repoIndicator ? (
                    <span fg={repoIndicator.running ? theme.accent : theme.dim}>
                      {repoIndicator.running
                        ? `  ${frame} ${repoIndicator.verb}…`
                        : `  ◌ ${repoIndicator.verb}`}
                    </span>
                  ) : block.rows.length === 0 ? (
                    <span fg={theme.accent}>{`  ${frame} refreshing…`}</span>
                  ) : null}
                </text>
              </box>

              {(() => {
                headerSeen++;
                return null;
              })()}
              {block.rows.map((row) => {
                const navigable = !row.isPendingCreate;
                const flatIdx = flatIndexMap.get(row.path);
                const isSelected = navigable && flatIdx === selectedIndex;
                const isWorkspaceMember =
                  workspaceMemberSet !== null &&
                  workspaceMemberSet.has(workspaceMemberKey(row.repoName, row.branch));
                return (
                  <WorktreeItem
                    key={row.path}
                    row={row}
                    isSelected={isSelected}
                    isMultiSelected={selection.has(row.path)}
                    indicator={rowVerbs.get(row.path)}
                    frame={frame}
                    id={isSelected ? "selected-row" : undefined}
                    isWorkspaceMember={isWorkspaceMember}
                    onRowClick={
                      navigable && flatIdx !== undefined && onRowClick ? () => onRowClick(flatIdx) : undefined
                    }
                    onToggleSelect={onToggleSelect ? () => onToggleSelect(row.path) : undefined}
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
