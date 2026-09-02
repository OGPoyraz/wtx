import type { WorktreeRow } from "../types.js";
import { useTheme } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";
import { openInBrowser } from "../platform.js";

export function DetailsContent({ selectedRow }: { selectedRow: WorktreeRow | null }) {
  const theme = useTheme();
  const prTap = useTapHandler(() => {
    if (selectedRow?.prUrl) void openInBrowser(selectedRow.prUrl);
  });

  if (!selectedRow) {
    return (
      <box flexGrow={1} width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={theme.dim}>No worktree selected</text>
      </box>
    );
  }

  const {
    repoName,
    branch,
    path,
    commitShort,
    isMainCheckout,
    isLocked,
    isPrunable,
    dirtyFiles,
    ahead,
    behind,
    prNumber,
    prState,
    prChecks,
    prUrl,
    owner,
    rebaseStatus,
    depsStrategy,
    base,
    baseChanged,
  } = selectedRow;

  const aheadBehindStr = ahead !== null && behind !== null ? `${ahead} ahead, ${behind} behind` : "unknown";

  return (
    <scrollbox flexGrow={1} width="100%" height="100%" focused={false} padding={1}>
      <text>
        <span fg={theme.dim}>Repo:</span>
        <span fg={theme.fg}>   {repoName}</span>
      </text>
      <text>
        <span fg={theme.dim}>Branch:</span>
        <span fg={theme.fg}>
          {" "}
          {branch} {isMainCheckout ? "(main checkout)" : ""}
        </span>
      </text>
      <text>
        <span fg={theme.dim}>Path:</span>
        <span fg={theme.fg}>   {path}</span>
      </text>
      <text>
        <span fg={theme.dim}>Commit:</span>
        <span fg={theme.fg}> {commitShort}</span>
      </text>

      {owner && (
        <text>
          <span fg={theme.dim}>Owner:</span>
          <span fg={theme.fg}>  {owner}</span>
        </text>
      )}

      <text>
        <span fg={theme.dim}>Status:</span>
        <span fg={theme.fg}> {isLocked ? "LOCKED" : isPrunable ? "PRUNABLE" : "Active"}</span>
      </text>

      {base && (
        <text>
          <span fg={theme.dim}>Base:</span>
          <span fg={theme.accent}>   {base}</span>
        </text>
      )}
      {baseChanged && (
        <text>
          <span fg={theme.dim}>Base state:</span>
          <span fg={theme.warning}> moved since recorded</span>
        </text>
      )}
      <text style={{ marginTop: 1 }}>
        <span fg={theme.dim}>{base ? "vs base:" : "vs main:"}</span>
        <span fg={theme.fg}> {aheadBehindStr}</span>
      </text>
      <text>
        <span fg={theme.dim}>Deps:</span>
        <span fg={theme.fg}>    {depsStrategy}</span>
      </text>

      {rebaseStatus && (
        <text>
          <span fg={theme.dim}>Rebase:</span>
          <span fg={theme.error}>  {rebaseStatus}</span>
        </text>
      )}

      {prNumber !== null && (
        <>
          <text style={{ marginTop: 1 }}>
            <span fg={theme.accent}>PR #{prNumber}:</span>
            <span fg={theme.dim}> {prState}</span>
          </text>
          {prChecks && (
            <text>
              <span fg={theme.dim}>Checks:</span>
              <span fg={theme.fg}> {prChecks}</span>
            </text>
          )}
          {prUrl && (
            <box {...prTap}>
              <text selectable={false}>
                <span fg={theme.dim}>URL:</span>
                <span fg={theme.accent}>{` ${prUrl}`}</span>
                <span fg={theme.dim}> ↗ click</span>
              </text>
            </box>
          )}
        </>
      )}

      {dirtyFiles.length > 0 && (
        <box flexDirection="column" style={{ marginTop: 1 }}>
          <text fg={theme.warning}>Dirty Files ({dirtyFiles.length}):</text>
          {dirtyFiles.slice(0, 20).map((file, idx) => (
            <text key={idx} fg={theme.warning}>
              {"  "}
              {file}
            </text>
          ))}
          {dirtyFiles.length > 20 && <text fg={theme.warning}>  ...and {dirtyFiles.length - 20} more</text>}
        </box>
      )}

      <box flexDirection="column" style={{ marginTop: 1 }}>
        <text fg={theme.dim}>Actions:</text>
        {!isMainCheckout && (
          <>
            <text fg={theme.dim}>  i install deps ({depsStrategy})</text>
            <text fg={theme.dim}>  m rename worktree</text>
          </>
        )}
        <text fg={theme.dim}>  p pull branch</text>
        <text fg={theme.dim}>  b rebase · s sync · o open in IDE · d remove</text>
        <text fg={theme.dim}>  t new terminal session (max 5)</text>
      </box>
    </scrollbox>
  );
}
