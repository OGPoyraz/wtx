
import type { WorktreeRow } from "../types.js";
import { tokens } from "../theme.js";

interface DetailPaneProps {
  selectedRow: WorktreeRow | null;
}

export function DetailPane({ selectedRow }: DetailPaneProps) {
  if (!selectedRow) {
    return (
      <box
        id="detail-pane"
        flexGrow={1}
        height="100%"
        border={true}
        borderColor={tokens.border}
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
    rebaseStatus, depsStrategy
  } = selectedRow;

  const aheadBehindStr = ahead !== null && behind !== null
    ? `${ahead} ahead, ${behind} behind`
    : "unknown";

  return (
    <scrollbox
      id="detail-pane"
      flexGrow={1}
      height="100%"
      border={true}
      borderColor={tokens.border}
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
      
      <text style={{ marginTop: 1 }}><span fg={tokens.dim}>vs main:</span><span fg={tokens.fg}> {aheadBehindStr}</span></text>
      <text><span fg={tokens.dim}>Deps:</span><span fg={tokens.fg}>    {depsStrategy}</span></text>
      
      {rebaseStatus && (
        <text><span fg={tokens.dim}>Rebase:</span><span fg={tokens.error}>  {rebaseStatus}</span></text>
      )}

      {prNumber !== null && (
        <>
          <text style={{ marginTop: 1 }}><span fg={tokens.accent}>PR #{prNumber}:</span><span fg={tokens.dim}> {prState}</span></text>
          {prChecks && <text><span fg={tokens.dim}>Checks:</span><span fg={tokens.fg}> {prChecks}</span></text>}
          {prUrl && <text><span fg={tokens.dim}>URL:</span><span fg={tokens.fg}>    {prUrl}</span></text>}
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
    </scrollbox>
  );
}
