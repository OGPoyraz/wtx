
import type { WorktreeRow } from "../types.js";
import { tokens } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";
import { openInBrowser } from "../platform.js";

interface DetailPaneProps {
  selectedRow: WorktreeRow | null;
}

export function DetailPane({ selectedRow }: DetailPaneProps) {
  const prTap = useTapHandler(() => {
    if (selectedRow?.prUrl) void openInBrowser(selectedRow.prUrl);
  });

  if (!selectedRow) {
    return (
      <box
        id="detail-pane"
        flexGrow={1}
        width="100%"
        height="100%"
        border={true}
        borderColor={tokens.border}
        focusedBorderColor={tokens.border}
        focusable={false}
        title="Details"
        padding={1}
        justifyContent="center"
        alignItems="center"
      >
        <text fg={tokens.dim}>No worktree selected</text>
      </box>
    );
  }

  const {
    repoName, branch, path, commitShort, isMainCheckout, isLocked, isPrunable,
    dirtyFiles, ahead, behind, prNumber, prState, prChecks, prUrl, owner,
    rebaseStatus, depsStrategy, base, baseChanged
  } = selectedRow;

  const aheadBehindStr = ahead !== null && behind !== null
    ? `${ahead} ahead, ${behind} behind`
    : "unknown";

  return (
    <scrollbox
      id="detail-pane"
      flexGrow={1}
      width="100%"
      height="100%"
      border={true}
      borderColor={tokens.border}
      focusedBorderColor={tokens.border}
      focusable={false}
      title="Details"
      padding={1}
      focused={false}
    >
      <text><span fg={tokens.dim}>Repo:</span><span fg={tokens.fg}>   {repoName}</span></text>
      <text><span fg={tokens.dim}>Branch:</span><span fg={tokens.fg}> {branch} {isMainCheckout ? "(main checkout)" : ""}</span></text>
      <text><span fg={tokens.dim}>Path:</span><span fg={tokens.fg}>   {path}</span></text>
      <text><span fg={tokens.dim}>Commit:</span><span fg={tokens.fg}> {commitShort}</span></text>
      
      {owner && <text><span fg={tokens.dim}>Owner:</span><span fg={tokens.fg}>  {owner}</span></text>}
      
      <text><span fg={tokens.dim}>Status:</span><span fg={tokens.fg}> {isLocked ? "LOCKED" : isPrunable ? "PRUNABLE" : "Active"}</span></text>
      
      {base && (
        <text><span fg={tokens.dim}>Base:</span><span fg={tokens.accent}>   {base}</span></text>
      )}
      {baseChanged && (
        <text><span fg={tokens.dim}>Base state:</span><span fg={tokens.warning}> moved since recorded</span></text>
      )}
      <text style={{ marginTop: 1 }}><span fg={tokens.dim}>{base ? "vs base:" : "vs main:"}</span><span fg={tokens.fg}> {aheadBehindStr}</span></text>
      <text><span fg={tokens.dim}>Deps:</span><span fg={tokens.fg}>    {depsStrategy}</span></text>
      
      {rebaseStatus && (
        <text><span fg={tokens.dim}>Rebase:</span><span fg={tokens.error}>  {rebaseStatus}</span></text>
      )}

      {prNumber !== null && (
        <>
          <text style={{ marginTop: 1 }}><span fg={tokens.accent}>PR #{prNumber}:</span><span fg={tokens.dim}> {prState}</span></text>
          {prChecks && <text><span fg={tokens.dim}>Checks:</span><span fg={tokens.fg}> {prChecks}</span></text>}
          {prUrl && (
            <box {...prTap}>
              <text selectable={false}>
                <span fg={tokens.dim}>URL:</span>
                <span fg={tokens.accent}>{` ${prUrl}`}</span>
                <span fg={tokens.dim}> ↗ click</span>
              </text>
            </box>
          )}
        </>
      )}

      {dirtyFiles.length > 0 && (
        <box flexDirection="column" style={{ marginTop: 1 }}>
          <text fg={tokens.warning}>Dirty Files ({dirtyFiles.length}):</text>
          {dirtyFiles.slice(0, 20).map((file, idx) => (
            <text key={idx} fg={tokens.warning}>  {file}</text>
          ))}
          {dirtyFiles.length > 20 && (
            <text fg={tokens.warning}>  ...and {dirtyFiles.length - 20} more</text>
          )}
        </box>
      )}

      <box flexDirection="column" style={{ marginTop: 1 }}>
        <text fg={tokens.dim}>Actions:</text>
        {!isMainCheckout && (
          <>
            <text fg={tokens.dim}>  i install deps ({depsStrategy})</text>
            <text fg={tokens.dim}>  m rename worktree</text>
          </>
        )}
        <text fg={tokens.dim}>  p pull branch</text>
        <text fg={tokens.dim}>  b rebase · s sync · o open in IDE · d remove</text>
      </box>
    </scrollbox>
  );
}
