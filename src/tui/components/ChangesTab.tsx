import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { WorktreeRow } from "../types.js";
import { useTheme } from "../theme.js";
import { getChangedFiles, getFileDiff, type ChangedFile, type ChangeScope, type FileDiff } from "../../lib/changes.js";
import { getStackBase } from "../../lib/stack.js";
import { useSpinnerFrame } from "../hooks/useSpinnerFrame.js";

interface ChangesContentProps {
  selectedRow: WorktreeRow | null;
  isActive: boolean;
  focused?: boolean;
  worktreeKey?: string;
}

const CHANGE_SCOPES: readonly ChangeScope[] = ["worktree", "staged", "base"];
const defaultScope: ChangeScope = "worktree";
const rememberedScopeByWorktree = new Map<string, ChangeScope>();

interface ScopeState {
  worktreeKey: string;
  scope: ChangeScope;
}

function fallbackWorktreeKey(selectedRow: WorktreeRow | null): string {
  if (!selectedRow) return "";
  return [selectedRow.repoName, selectedRow.branch, selectedRow.path].join("\0");
}

function rememberedScope(worktreeKey: string): ChangeScope {
  return rememberedScopeByWorktree.get(worktreeKey) ?? defaultScope;
}

function nextChangeScope(scope: ChangeScope): ChangeScope {
  const index = CHANGE_SCOPES.indexOf(scope);
  return CHANGE_SCOPES[(index + 1) % CHANGE_SCOPES.length] ?? defaultScope;
}

function scopeCacheKey(worktreeKey: string, scope: ChangeScope): string {
  return `${worktreeKey}\0${scope}`;
}

function formatBaseRef(baseRef: string | null): string {
  return (baseRef ?? "main")
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/[^/]+\//, "");
}

export function useChangesTabModel(
  isActive: boolean,
  selectedRow: WorktreeRow | null,
  worktreeKey = fallbackWorktreeKey(selectedRow),
  getChangedFilesImpl = getChangedFiles,
  getFileDiffImpl = getFileDiff,
  getStackBaseImpl = getStackBase
) {
  const [scopeState, setScopeState] = useState<ScopeState>(() => ({
    worktreeKey,
    scope: rememberedScope(worktreeKey),
  }));
  const scope = scopeState.worktreeKey === worktreeKey ? scopeState.scope : rememberedScope(worktreeKey);
  const [baseRef, setBaseRef] = useState("main");

  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const [diffs, setDiffs] = useState<Record<string, FileDiff>>({});
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const filesByScopeRef = useRef<Map<string, ChangedFile[]>>(new Map());

  const scopeLabel = useMemo(() => {
    if (scope === "base") return `vs ${formatBaseRef(baseRef)}`;
    return scope;
  }, [scope, baseRef]);

  useEffect(() => {
    if (!worktreeKey) return;
    const nextScope = rememberedScope(worktreeKey);
    setScopeState((prev) => {
      if (prev.worktreeKey === worktreeKey && prev.scope === nextScope) return prev;
      return { worktreeKey, scope: nextScope };
    });
    setFiles(null);
    setSelectedIndex(0);
    setDiffs({});
    setLoadingDiff(false);
    setDiffError(null);
  }, [worktreeKey]);

  useEffect(() => {
    if (!selectedRow) {
      setBaseRef("main");
      return;
    }

    let canceled = false;
    getStackBaseImpl(selectedRow.path, selectedRow.branch)
      .then((res) => {
        if (!canceled) setBaseRef(formatBaseRef(res));
      })
      .catch(() => {
        if (!canceled) setBaseRef("main");
      });

    return () => {
      canceled = true;
    };
  }, [selectedRow?.path, selectedRow?.branch, getStackBaseImpl]);

  const cycleScope = useCallback(() => {
    if (!worktreeKey) return;
    const nextScope = nextChangeScope(scope);
    rememberedScopeByWorktree.set(worktreeKey, nextScope);
    setScopeState({ worktreeKey, scope: nextScope });
    setFiles(null);
    setSelectedIndex(0);
    setDiffs({});
    setLoadingDiff(false);
    setDiffError(null);
  }, [scope, worktreeKey]);

  useEffect(() => {
    if (!isActive || !selectedRow) return;

    const cachedFiles = filesByScopeRef.current.get(scopeCacheKey(worktreeKey, scope));
    if (cachedFiles) {
      setFiles(cachedFiles);
      setSelectedIndex(0);
      setLoadingList(false);
      setListError(null);
      return;
    }

    let canceled = false;
    setFiles(null);
    setLoadingList(true);
    setListError(null);
    setDiffs({});
    setDiffError(null);

    getChangedFilesImpl({
      repoPath: selectedRow.path,
      branch: selectedRow.branch,
      scope,
    })
      .then((res) => {
        if (canceled) return;
        filesByScopeRef.current.set(scopeCacheKey(worktreeKey, scope), res);
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
  }, [isActive, selectedRow?.path, selectedRow?.branch, worktreeKey, scope, getChangedFilesImpl]);

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
      scope,
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
  }, [isActive, selectedRow?.path, selectedRow?.branch, scope, selectedFile, diffs, getFileDiffImpl]);

  return {
    scope,
    scopeLabel,
    cycleScope,
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

export function ChangesContent({ selectedRow, isActive, focused, worktreeKey }: ChangesContentProps) {
  const theme = useTheme();
  const {
    scopeLabel,
    cycleScope,
    files,
    loadingList,
    listError,
    selectedIndex,
    setSelectedIndex,
    diffs,
    loadingDiff,
    diffError,
    selectedFile,
  } = useChangesTabModel(isActive, selectedRow, worktreeKey);

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
    if (key.name === "s" || key.name === "tab") {
      cycleScope();
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
          <text fg={theme.bright}>Files changed · {scopeLabel}</text>
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
