import { useEffect, useState, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { WorktreeRow } from "../types.js";
import { useTheme } from "../theme.js";
import { getChangedFiles, getFileDiff, type ChangedFile, type FileDiff } from "../../lib/changes.js";
import { useSpinnerFrame } from "../hooks/useSpinnerFrame.js";

interface ChangesContentProps {
  selectedRow: WorktreeRow | null;
  isActive: boolean;
  focused?: boolean;
}

export function useChangesTabModel(
  isActive: boolean,
  selectedRow: WorktreeRow | null,
  getChangedFilesImpl = getChangedFiles,
  getFileDiffImpl = getFileDiff
) {
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const [diffs, setDiffs] = useState<Record<string, FileDiff>>({});
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive || !selectedRow) return;

    let canceled = false;
    setLoadingList(true);
    setListError(null);

    getChangedFilesImpl({
      repoPath: selectedRow.path,
      branch: selectedRow.branch,
      scope: "worktree",
    })
      .then((res) => {
        if (canceled) return;
        setFiles(res);
        setSelectedIndex(0);
        setLoadingList(false);
      })
      .catch((err) => {
        if (canceled) return;
        setListError(String(err));
        setLoadingList(false);
      });

    return () => {
      canceled = true;
    };
  }, [isActive, selectedRow?.path, selectedRow?.branch, getChangedFilesImpl]);

  const selectedFile = files?.[selectedIndex];
  useEffect(() => {
    if (!isActive || !selectedRow || !selectedFile) return;
    if (diffs[selectedFile.path]) return;

    let canceled = false;
    setLoadingDiff(true);
    setDiffError(null);

    getFileDiffImpl({
      repoPath: selectedRow.path,
      branch: selectedRow.branch,
      scope: "worktree",
      filePath: selectedFile.path,
    })
      .then((res) => {
        if (canceled) return;
        setDiffs((prev) => ({ ...prev, [selectedFile.path]: res }));
        setLoadingDiff(false);
      })
      .catch((err) => {
        if (canceled) return;
        setDiffError(String(err));
        setLoadingDiff(false);
      });

    return () => {
      canceled = true;
    };
  }, [isActive, selectedRow?.path, selectedRow?.branch, selectedFile, diffs, getFileDiffImpl]);

  return {
    files,
    loadingList,
    listError,
    selectedIndex,
    setSelectedIndex,
    diffs,
    loadingDiff,
    diffError,
    selectedFile,
  };
}

export function ChangesContent({ selectedRow, isActive, focused }: ChangesContentProps) {
  const theme = useTheme();
  const {
    files,
    loadingList,
    listError,
    selectedIndex,
    setSelectedIndex,
    diffs,
    loadingDiff,
    diffError,
    selectedFile,
  } = useChangesTabModel(isActive, selectedRow);

  const spinner = useSpinnerFrame(loadingList || loadingDiff);
  const listScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const diffScrollRef = useRef<ScrollBoxRenderable | null>(null);

  useKeyboard((key) => {
    if (!focused || !isActive) return;

    if (key.name === "j" || key.name === "down") {
      setSelectedIndex((prev) => {
        const next = Math.min(prev + 1, (files?.length ?? 1) - 1);
        return next;
      });
      key.stopPropagation();
      key.preventDefault();
      return;
    }
    if (key.name === "k" || key.name === "up") {
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      key.stopPropagation();
      key.preventDefault();
      return;
    }
  });

  useEffect(() => {
    if (listScrollRef.current?.scrollChildIntoView) {
      listScrollRef.current.scrollChildIntoView("selected-file");
    }
  }, [selectedIndex]);

  if (!selectedRow) {
    return (
      <box flexGrow={1} width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={theme.dim}>No worktree selected</text>
      </box>
    );
  }

  if (listError) {
    return (
      <box flexGrow={1} width="100%" height="100%" padding={1}>
        <text fg={theme.error}>Error: {listError}</text>
      </box>
    );
  }

  if (!files && loadingList) {
    return (
      <box flexGrow={1} width="100%" height="100%" padding={1}>
        <text fg={theme.accent}>{spinner} Loading changes...</text>
      </box>
    );
  }

  if (files?.length === 0) {
    return (
      <box flexGrow={1} width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={theme.dim}>No changes in working tree</text>
      </box>
    );
  }

  const getStatusColor = (status: string) => {
    if (status.startsWith("M")) return theme.warning;
    if (status.startsWith("A")) return theme.success;
    if (status.startsWith("D")) return theme.error;
    if (status.startsWith("R")) return theme.accent;
    return theme.fg;
  };

  const currentDiff = selectedFile ? diffs[selectedFile.path] : null;

  return (
    <box flexGrow={1} width="100%" height="100%" flexDirection="row">
      <box width={35} height="100%" border={["right"]} borderColor={theme.border} flexDirection="column">
        <box paddingX={1} paddingBottom={1}>
          <text fg={theme.bright}>Files changed</text>
        </box>
        <scrollbox ref={listScrollRef} flexGrow={1} width="100%" focused={false} paddingX={1}>
          {files?.map((f, idx) => {
            const isSelected = idx === selectedIndex;
            const bg = isSelected ? (focused ? theme.selectionBg : theme.border) : undefined;
            const statusColor = getStatusColor(f.status);

            return (
              <box
                key={f.path}
                id={isSelected ? "selected-file" : undefined}
                width="100%"
                backgroundColor={bg}
                flexDirection="row"
              >
                <text style={{ minWidth: 2, marginRight: 1 }}>
                  <span fg={statusColor}>{f.status[0]}</span>
                </text>
                <text flexGrow={1}>
                  <span fg={isSelected ? theme.bright : theme.fg}>{f.path}</span>
                </text>
                {(!f.binary) && (
                  <text style={{ marginLeft: 1 }}>
                    {f.added > 0 && <span fg={theme.success}>+{f.added}</span>}
                    {f.removed > 0 && <span fg={theme.error}>-{f.removed}</span>}
                  </text>
                )}
              </box>
            );
          })}
        </scrollbox>
      </box>

      <box flexGrow={1} height="100%" flexDirection="column" paddingX={1}>
        <box paddingBottom={1} flexDirection="row">
          <text fg={theme.bright}>{selectedFile?.path ?? "Select a file"}</text>
          {(loadingDiff || loadingList) && <text fg={theme.accent}>  {spinner}</text>}
        </box>

        {diffError ? (
          <text fg={theme.error}>Error: {diffError}</text>
        ) : currentDiff ? (
          currentDiff.binary ? (
            <box flexGrow={1} width="100%" height="100%" justifyContent="center" alignItems="center">
              <text fg={theme.dim}>Binary file differ</text>
            </box>
          ) : (
            <scrollbox ref={diffScrollRef} flexGrow={1} width="100%" focused={false}>
              {currentDiff.diff.split("\n").map((line, i) => {
                let fg = theme.fg;
                if (line.startsWith("+") && !line.startsWith("+++")) fg = theme.success;
                else if (line.startsWith("-") && !line.startsWith("---")) fg = theme.error;
                else if (line.startsWith("@@")) fg = theme.accent;
                else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) fg = theme.dim;

                return <text key={i} fg={fg}>{line}</text>;
              })}
              {currentDiff.truncated && (
                <text fg={theme.warning}>
                  [ Diff truncated ]
                </text>
              )}
            </scrollbox>
          )
        ) : (
          <box flexGrow={1} width="100%" height="100%" />
        )}
      </box>
    </box>
  );
}
