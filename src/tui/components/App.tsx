import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { existsSync } from "node:fs";
import { useKeyboard, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/react";
import type { GlobalOptions } from "../../types.js";
import { useWorktrees } from "../hooks/useWorktrees.js";
import { WorktreeTable } from "./WorktreeTable.js";
import type { VerbIndicator } from "./WorktreeTable.js";
import { DetailPane } from "./DetailPane.js";
import { Footer } from "./Footer.js";
import { Divider } from "./Divider.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { runWtxAction } from "../actions.js";
import { validateSafeBranchName } from "../../lib/git.js";
import type { WorktreeRow, RepoBlock } from "../types.js";
import { ActionLogModal } from "./ActionLogModal.js";
import { HistoryOverlay } from "./HistoryOverlay.js";
import { InputModal } from "./InputModal.js";
import { ChoiceModal } from "./ChoiceModal.js";
import type { ChoiceOption } from "./ChoiceModal.js";
import { ConfigOverlay } from "./ConfigOverlay.js";
import { WarningsOverlay } from "./WarningsOverlay.js";
import { matchesFilter, toggleSelection, withCreatePlaceholders, sortBlocks, clampSplitRatio, DIVIDER_WIDTH } from "../utils.js";
import { copyTextToClipboard } from "../platform.js";
import { loadConfig } from "../../lib/config.js";
import { useSpinnerFrame } from "../hooks/useSpinnerFrame.js";

export interface AppProps {
  opts: GlobalOptions;
}

type ModalState =
  | { type: "none" }
  | { type: "help" }
  | { type: "history" }
  | { type: "warnings" }
  | { type: "confirm_remove"; rows: WorktreeRow[] }
  | { type: "confirm_rebase"; rows: WorktreeRow[] }
  | { type: "confirm_sync"; rows: WorktreeRow[] }
  | { type: "confirm_rename"; row: WorktreeRow; to: string }
  | { type: "error"; message: string };

type BusyKind = "create" | "remove" | "rebase" | "sync" | "fetch" | "open" | "install" | "pull" | "rename";

const VERBS: Record<BusyKind, string> = {
  create: "creating worktree",
  remove: "deleting",
  rebase: "rebasing",
  sync: "syncing",
  fetch: "fetching",
  open: "opening",
  install: "installing deps",
  pull: "pulling",
  rename: "renaming",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DEPS_CHOICES: ChoiceOption[] = [
  { value: "auto", label: "Auto (default)", desc: "Safe-link when manifests match main, real install otherwise" },
  { value: "install", label: "Install", desc: "Real install in the worktree (uses the repo's install_script when configured)" },
  { value: "symlink", label: "Symlink", desc: "Share main checkout's node_modules via symlink" },
];

function getWorktreePathFor(repoName: string, branch: string): string {
  try {
    const config = loadConfig();
    const root = config.root.startsWith("~")
      ? config.root.replace(/^~/, process.env.HOME ?? "")
      : config.root;
    return `${root}/${repoName}${config.postfix}/${branch}`;
  } catch {
    return "";
  }
}

interface PendingOp {
  id: number;
  kind: BusyKind;
  repoNames: string[];
  rowPath?: string;
  branch?: string;
  label: string;
  title: string;
  status: "queued" | "running";
  lines: { text: string; type: "out" | "err" }[];
}

interface FailedAction {
  title: string;
  lines: { text: string; type: "out" | "err" }[];
  exitCode: number;
}

export function App({ opts }: AppProps) {
  const renderer = useRenderer();
  const { blocks, loading, refreshing, error, warnings, lastRefreshed, pendingRepos, refresh, clearWarnings } = useWorktrees(opts);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ops, setOps] = useState<PendingOp[]>([]);
  const [failedLogs, setFailedLogs] = useState<FailedAction[]>([]);
  const nextOpId = useRef(1);

  const [createModal, setCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createBaseModal, setCreateBaseModal] = useState<{ branch: string; repoName: string } | null>(null);
  const [createBaseError, setCreateBaseError] = useState<string | undefined>();
  const [createDepsChoice, setCreateDepsChoice] = useState<{ branch: string; repoName: string; base?: string } | null>(null);
  const [pullPrModal, setPullPrModal] = useState(false);
  const [pullPrError, setPullPrError] = useState<string | undefined>();
  const [pullForceChoice, setPullForceChoice] = useState<{ link: string; repoName: string } | null>(null);
  const [renameModal, setRenameModal] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>();
  const [configOpen, setConfigOpen] = useState(false);
  const [refreshScopes, setRefreshScopes] = useState<string[]>([]);

  const [filterText, setFilterText] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      const cfg = loadConfig();
      const left = cfg.tui?.leftPaneWidthWeight ?? 3;
      const right = cfg.tui?.rightPaneWidthWeight ?? 7;
      const total = left + right;
      if (total > 0) return left / total;
    } catch {}
    return 3 / 10;
  });
  const [isResizing, setIsResizing] = useState(false);
  const { width: termWidth } = useTerminalDimensions();
  const totalWidth = termWidth || renderer.width || 80;

  useEffect(() => {
    if (termWidth) setSplitRatio((prev) => clampSplitRatio(termWidth, prev));
  }, [termWidth]);

  const doRefresh = useCallback(
    async (scope?: string[]) => {
      const targets = scope ?? [
        ...new Set([...blocks.map(b => b.repoName), ...pendingRepos]),
      ];
      setRefreshScopes(targets);
      try {
        await refresh(scope);
      } finally {
        setRefreshScopes([]);
      }
    },
    [blocks, pendingRepos, refresh]
  );

  useEffect(() => {
    if (error) {
      setModal({ type: "error", message: error });
    }
  }, [error]);

  const flash = useCallback((message: string, ms = 3000) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setActionMessage(message);
    messageTimer.current = setTimeout(() => setActionMessage(undefined), ms);
  }, []);

  // Terminals intercept Cmd+C before it reaches the app; copy when drag selection completes.
  const copySelectedText = useCallback(
    (warnOnEmpty: boolean) => {
      if (isResizing) {
        renderer.clearSelection();
        return;
      }
      const text = renderer.getSelection()?.getSelectedText() ?? "";
      if (!text) {
        if (warnOnEmpty) flash("Nothing selected to copy");
        return;
      }
      void copyTextToClipboard(renderer, text).then((ok) =>
        flash(ok ? `Copied ${text.length} character${text.length !== 1 ? "s" : ""}` : "Copy failed")
      );
    },
    [renderer, flash, isResizing]
  );

  useSelectionHandler(() => copySelectedText(false));

  const busyRepos = useMemo(() => new Set(ops.flatMap(o => o.repoNames)), [ops]);
  const busyRowPaths = useMemo(
    () => new Set(ops.map(o => o.rowPath).filter((p): p is string => p !== undefined)),
    [ops]
  );
  const anyRunning = ops.some(o => o.status === "running");
  const spinnerFrame = useSpinnerFrame(anyRunning || loading || refreshing);

  const baseFiltered = useMemo(
    () =>
      blocks
        .map(b => ({ ...b, rows: b.rows.filter(r => matchesFilter(r, filterText)) }))
        .filter(b => b.rows.length > 0 || pendingRepos.includes(b.repoName)),
    [blocks, filterText, pendingRepos]
  );

  const pendingBlocks = useMemo<RepoBlock[]>(() => {
    const existing = new Set(baseFiltered.map(b => b.repoName));
    return pendingRepos
      .filter(name => !existing.has(name) && matchesFilter({ repoName: name, branch: "" } as WorktreeRow, filterText))
      .map(repoName => ({ repoName, rows: [] }));
  }, [baseFiltered, pendingRepos, filterText]);

  const displayBlocks = useMemo(
    () =>
      sortBlocks([
        ...withCreatePlaceholders(
          baseFiltered,
          ops.filter(o => o.branch !== undefined).map(o => ({ repoName: o.repoNames[0]!, branch: o.branch! }))
        ),
        ...pendingBlocks,
      ]),
    [baseFiltered, ops, pendingBlocks]
  );

  const flatRows = useMemo(
    () => displayBlocks.flatMap(b => b.rows.filter(r => !r.isPendingCreate)),
    [displayBlocks]
  );
  const totalRows = blocks.flatMap(b => b.rows).length;
  const maxIndex = Math.max(0, flatRows.length - 1);

  useEffect(() => {
    if (selectedIndex > maxIndex && maxIndex >= 0) {
      setSelectedIndex(maxIndex);
    }
  }, [maxIndex, selectedIndex]);

  const selectedRow = flatRows[selectedIndex] ?? null;

  const { repoVerbs, rowVerbs } = useMemo(() => {
    const rv = new Map<string, VerbIndicator>();
    const nv = new Map<string, VerbIndicator>();
    for (const o of ops) {
      const indicator: VerbIndicator = { verb: VERBS[o.kind], running: o.status === "running" };
      if (o.rowPath) {
        nv.set(o.rowPath, indicator);
      } else {
        for (const rn of o.repoNames) rv.set(rn, indicator);
      }
    }
    for (const rn of refreshScopes) {
      if (!rv.has(rn)) rv.set(rn, { verb: "refreshing", running: true });
    }
    return { repoVerbs: rv, rowVerbs: nv };
  }, [ops, refreshScopes]);

  const runningOps = ops.filter(o => o.status === "running");
  const latestOp = runningOps[runningOps.length - 1];

  const getSelectedRows = (): WorktreeRow[] => {
    if (selection.size > 0) {
      return blocks.flatMap(b => b.rows).filter(r => selection.has(r.path));
    }
    return selectedRow ? [selectedRow] : [];
  };

  const findConflict = (targets: WorktreeRow[]): string | null => {
    for (const t of targets) {
      if (busyRowPaths.has(t.path)) return `${t.branch} is busy`;
    }
    for (const t of targets) {
      if (busyRepos.has(t.repoName)) return `${t.repoName} is busy`;
    }
    return null;
  };

  const executeOp = async (op: PendingOp, args: string[], refreshScope: string[] | null) => {
    setOps(prev => prev.map(o => (o.id === op.id ? { ...o, status: "running" } : o)));

    const collected: { text: string; type: "out" | "err" }[] = [];
    let exitCode: number;
    try {
      const result = await runWtxAction(args, (text, type) => {
        collected.push({ text, type });
        setOps(prev => prev.map(o => (o.id === op.id ? { ...o, lines: [...o.lines, { text, type }] } : o)));
      });
      exitCode = result.exitCode;
    } catch (err) {
      exitCode = 1;
      const msg = err instanceof Error ? err.message : String(err);
      collected.push({ text: `Failed to run wtx ${args.join(" ")}: ${msg}`, type: "err" });
    }

    if (exitCode === 0) {
      if (refreshScope) await doRefresh(refreshScope);
      setOps(prev => prev.filter(o => o.id !== op.id));
    } else {
      setOps(prev => prev.filter(o => o.id !== op.id));
      setFailedLogs(prev => [...prev, { title: op.title, lines: collected, exitCode }]);
    }
  };

  const startBatchActions = (
    kind: Exclude<BusyKind, "fetch">,
    targets: WorktreeRow[],
    argsFor: (row: WorktreeRow) => string[]
  ) => {
    const created = targets.map(row => {
      const op: PendingOp = {
        id: nextOpId.current++,
        kind,
        repoNames: [row.repoName],
        rowPath: row.path,
        label: row.branch,
        title: `${capitalize(VERBS[kind])} ${row.branch}`,
        status: "queued",
        lines: [],
      };
      return { op, row };
    });
    setOps(prev => [...prev, ...created.map(c => c.op)]);
    void (async () => {
      for (const { op, row } of created) {
        await executeOp(op, argsFor(row), [row.repoName]);
      }
      setSelection(new Set());
    })();
  };

  const startFetch = (targets: WorktreeRow[]) => {
    const repoNames = [...new Set(targets.map(t => t.repoName))];
    const conflict = repoNames.find(rn => busyRepos.has(rn));
    if (conflict) {
      flash(`${conflict} is busy`);
      return;
    }
    const label = repoNames.length === 1 ? repoNames[0]! : `${repoNames.length} repos`;
    const op: PendingOp = {
      id: nextOpId.current++,
      kind: "fetch",
      repoNames,
      label,
      title: `Fetch ${label}`,
      status: "queued",
      lines: [],
    };
    setOps(prev => [...prev, op]);
    void executeOp(op, ["fetch", "--repo", repoNames.join(",")], repoNames).then(() =>
      setSelection(new Set())
    );
  };

  const startCreate = (branch: string, repoName: string, deps?: string, base?: string) => {
    const op: PendingOp = {
      id: nextOpId.current++,
      kind: "create",
      repoNames: [repoName],
      branch,
      label: `${branch} in ${repoName}`,
      title: `Create ${branch}`,
      status: "queued",
      lines: [],
    };
    setOps(prev => [...prev, op]);
    const args = ["create", branch, "--repo", repoName];
    if (base) args.push("--base", base);
    if (deps && deps !== "auto") args.push("--deps", deps);
    void executeOp(op, args, [repoName]);
  };

  const startPullPr = (link: string, repoName: string, force?: boolean) => {
    const op: PendingOp = {
      id: nextOpId.current++,
      kind: "pull",
      repoNames: [repoName],
      label: `PR ${link.split("/").pop()}`,
      title: `Pull ${link}`,
      status: "queued",
      lines: [],
    };
    setOps(prev => [...prev, op]);
    const args = ["pull", link, "--repo", repoName];
    if (force) args.push("--force");
    void executeOp(op, args, [repoName]);
  };

  const handleHintClick = useCallback(
    (key: string) => {
      if (key === "c") {
        setConfigOpen(true);
        return;
      }
      if (key === "?") {
        setModal({ type: "help" });
        return;
      }
      if (key === "H") {
        setModal({ type: "history" });
        return;
      }
      if (key === "r") {
        void doRefresh();
        return;
      }
      if (key === "e" && warnings.length > 0) {
        setModal({ type: "warnings" });
        return;
      }
      if (key === "n") {
        if (!selectedRow) return;
        setCreateModal(true);
        setCreateError(undefined);
        return;
      }
      if (key === "m") {
        const target = selectedRow;
        if (!target || target.isMainCheckout || !target.branch || target.branch === "(detached)") {
          if (target?.isMainCheckout) flash("Cannot rename main checkout");
          else if (target && (!target.branch || target.branch === "(detached)")) flash("Cannot rename detached worktree");
          return;
        }
        const conflict = findConflict([target]);
        if (conflict) {
          flash(conflict);
          return;
        }
        setRenameModal(true);
        setRenameError(undefined);
        return;
      }
      if (key === "f") {
        const targets = getSelectedRows();
        if (targets.length > 0) startFetch(targets);
        return;
      }
      if (key === "o") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.length > 1) {
          flash("Cannot open multiple worktrees");
          return;
        }
        const target = targets[0]!;
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        const op: PendingOp = {
          id: nextOpId.current++,
          kind: "open",
          repoNames: [target.repoName],
          rowPath: target.path,
          label: target.branch,
          title: `Open ${target.branch}`,
          status: "queued",
          lines: [],
        };
        setOps((prev) => [...prev, op]);
        void executeOp(op, ["open", target.branch, "--repo", target.repoName], null);
        return;
      }
      if (key === "i") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        startBatchActions("install", targets, (r) =>
          r.isMainCheckout ? ["deps", "--repo", r.repoName, "--install"] : ["deps", r.branch, "--repo", r.repoName, "--install"]
        );
        return;
      }
      if (key === "p") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        startBatchActions("pull", targets, (r) => ["pull-branch", r.branch, "--repo", r.repoName]);
        return;
      }
      if (key === "b") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some((r) => r.isMainCheckout)) {
          flash("Cannot rebase main checkout");
          return;
        }
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        setModal({ type: "confirm_rebase", rows: targets });
        return;
      }
      if (key === "d") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some((r) => r.isMainCheckout)) {
          flash("Cannot remove main checkout");
          return;
        }
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        setModal({ type: "confirm_remove", rows: targets });
        return;
      }
      if (key === "s") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some((r) => r.isMainCheckout)) {
          flash("Cannot sync main checkout");
          return;
        }
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        setModal({ type: "confirm_sync", rows: targets });
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRow, selection, warnings, busyRepos, busyRowPaths, doRefresh, flash, blocks]
  );

  useKeyboard(
    (key) => {
      if (isFiltering) {
        if (key.name === "escape") {
          setIsFiltering(false);
          setFilterText("");
          setSelectedIndex(0);
        } else if (key.name === "return") {
          setIsFiltering(false);
        }
        return;
      }

      if (failedLogs.length > 0) {
        setFailedLogs(prev => prev.slice(1));
        return;
      }

      if (configOpen) return;

      if (createModal) {
        if (key.name === "escape") {
          setCreateModal(false);
          setCreateError(undefined);
        }
        return;
      }

      if (createBaseModal) {
        if (key.name === "escape") {
          setCreateBaseModal(null);
          setCreateBaseError(undefined);
        }
        return;
      }

      if (createDepsChoice) return;

      if (pullPrModal) {
        if (key.name === "escape") {
          setPullPrModal(false);
          setPullPrError(undefined);
        }
        return;
      }

      if (pullForceChoice) return;

      if (renameModal) {
        if (key.name === "escape") {
          setRenameModal(false);
          setRenameError(undefined);
        }
        return;
      }

      // Modal handling
      if (modal.type !== "none") {
        if (modal.type === "warnings") {
          if (key.name === "a") {
            clearWarnings();
            setModal({ type: "none" });
            return;
          }
          if (key.name === "escape" || key.name === "q" || key.name === "enter" || key.name === "return") {
            setModal({ type: "none" });
            return;
          }
          setModal({ type: "none" });
          return;
        }
        if (modal.type === "error" || modal.type === "help" || modal.type === "history") {
          // any key closes
          setModal({ type: "none" });
          if (modal.type === "error" && error) {
            renderer.destroy();
            process.exit(1);
          }
          return;
        }

        // Confirm modals
        if (
          modal.type === "confirm_remove" ||
          modal.type === "confirm_rebase" ||
          modal.type === "confirm_sync" ||
          modal.type === "confirm_rename"
        ) {
          if (key.name === "y") {
            const rows = "rows" in modal ? modal.rows : [];
            const action = modal.type;
            setModal({ type: "none" });

            if (action === "confirm_remove") {
              startBatchActions("remove", rows, (r) => {
                const args = ["remove", r.branch, "--repo", r.repoName, "--yes"];
                const needsForce = r.dirtyFiles.length > 0 || !existsSync(r.path);
                if (needsForce) args.push("--force");
                return args;
              });
            } else if (action === "confirm_rebase") {
              startBatchActions("rebase", rows, (r) => ["rebase", r.branch, "--repo", r.repoName]);
            } else if (action === "confirm_sync") {
              startBatchActions("sync", rows, (r) => ["sync", r.branch, "--repo", r.repoName]);
            } else if (action === "confirm_rename") {
              const { row, to } = modal;
              const op: PendingOp = {
                id: nextOpId.current++,
                kind: "rename",
                repoNames: [row.repoName],
                rowPath: row.path,
                branch: row.branch,
                label: `${row.branch} → ${to}`,
                title: `Rename ${row.branch} → ${to}`,
                status: "queued",
                lines: [],
              };
              setOps(prev => [...prev, op]);
              void executeOp(op, ["rename", row.branch, to, "--repo", row.repoName], [row.repoName]);
            }
            return;
          }

          if (key.name === "n" || key.name === "escape" || key.name === "q") {
            setModal({ type: "none" });
          }
          return;
        }
      }

      if ((key.super || key.meta || (key.ctrl && key.shift)) && key.name === "c") {
        copySelectedText(true);
        return;
      }

      if (key.name === "q" || key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (key.name === "escape" && selection.size > 0) {
          setSelection(new Set());
          return;
        }
        renderer.destroy();
        process.exit(0);
      }

      if (key.name === "/") {
        setIsFiltering(true);
        return;
      }

      if (key.name === "space") {
        if (selectedRow) {
          setSelection(prev => toggleSelection(prev, selectedRow.path));
        }
        return;
      }

      if (key.name === "down" || key.name === "j") {
        setSelectedIndex(prev => Math.min(prev + 1, maxIndex));
        return;
      }

      if (key.name === "up" || key.name === "k") {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }

      if (key.name === "r" && !key.shift) {
        void doRefresh();
        return;
      }

      if (key.name === "c" && !key.ctrl) {
        setConfigOpen(true);
        return;
      }

      if (key.name === "?" || key.name === "H" || (key.name === "h" && key.shift)) {
        if (key.name === "?") {
          setModal({ type: "help" });
        } else {
          setModal({ type: "history" });
        }
        return;
      }

      if (key.name === "e" && warnings.length > 0) {
        setModal({ type: "warnings" });
        return;
      }

      if (key.name === "n") {
        if (!selectedRow) return;
        setCreateModal(true);
        setCreateError(undefined);
        return;
      }

      if (key.name === "P" || (key.name === "p" && key.shift)) {
        const repoName = selectedRow?.repoName ?? getSelectedRows()[0]?.repoName;
        if (!repoName) {
          flash("No repo selected");
          return;
        }
        if (busyRepos.has(repoName)) {
          flash(`${repoName} is busy`);
          return;
        }
        setPullPrModal(true);
        setPullPrError(undefined);
        return;
      }

      if (key.name === "p") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        startBatchActions("pull", targets, (r) => ["pull-branch", r.branch, "--repo", r.repoName]);
        return;
      }

      if (key.name === "i") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        startBatchActions("install", targets, (r) =>
          r.isMainCheckout
            ? ["deps", "--repo", r.repoName, "--install"]
            : ["deps", r.branch, "--repo", r.repoName, "--install"]
        );
        return;
      }

      if (key.name === "m") {
        const target = selectedRow;
        if (!target) return;
        if (target.isMainCheckout) {
          flash("Cannot rename main checkout");
          return;
        }
        if (!target.branch || target.branch === "(detached)") {
          flash("Cannot rename detached worktree");
          return;
        }
        const conflict = findConflict([target]);
        if (conflict) {
          flash(conflict);
          return;
        }
        setRenameModal(true);
        setRenameError(undefined);
        return;
      }

      if (key.name === "f") {
        const targets = getSelectedRows();
        if (targets.length > 0) startFetch(targets);
        return;
      }

      if (key.name === "o") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.length > 1) {
          flash("Cannot open multiple worktrees");
          return;
        }
        const target = targets[0];
        if (!target) return;
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        const op: PendingOp = {
          id: nextOpId.current++,
          kind: "open",
          repoNames: [target.repoName],
          rowPath: target.path,
          label: target.branch,
          title: `Open ${target.branch}`,
          status: "queued",
          lines: [],
        };
        setOps(prev => [...prev, op]);
        void executeOp(op, ["open", target.branch, "--repo", target.repoName], null);
        return;
      }

      if (key.name === "d" || (key.name === "D" && key.shift)) {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some(r => r.isMainCheckout)) {
          flash("Cannot remove main checkout");
          return;
        }
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        setModal({ type: "confirm_remove", rows: targets });
        return;
      }

      if (key.name === "b" || key.name === "R" || (key.name === "r" && key.shift)) {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some(r => r.isMainCheckout)) {
          flash("Cannot rebase main checkout");
          return;
        }
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        setModal({ type: "confirm_rebase", rows: targets });
        return;
      }

      if (key.name === "s") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some(r => r.isMainCheckout)) {
          flash("Cannot sync main checkout");
          return;
        }
        const conflict = findConflict(targets);
        if (conflict) {
          flash(conflict);
          return;
        }
        setModal({ type: "confirm_sync", rows: targets });
        return;
      }
    }
  );

  const rawLeft = Math.floor(totalWidth * splitRatio);
  const leftCols = Math.max(20, Math.min(totalWidth - 20 - DIVIDER_WIDTH, rawLeft));
  const rightCols = Math.max(20, totalWidth - leftCols - DIVIDER_WIDTH);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" flexGrow={1}>
        <box width={leftCols} height="100%" flexDirection="column">
          <WorktreeTable
            blocks={displayBlocks}
            selectedIndex={selectedIndex}
            selection={selection}
            frame={spinnerFrame}
            repoVerbs={repoVerbs}
            rowVerbs={rowVerbs}
            onRowClick={(idx) => setSelectedIndex(idx)}
            onToggleSelect={(path) => setSelection((prev) => toggleSelection(prev, path))}
          />
        </box>
        <Divider splitRatio={splitRatio} totalWidth={totalWidth} onChange={setSplitRatio} onDraggingChange={setIsResizing} />
        <box width={rightCols} height="100%" flexDirection="column">
          <DetailPane selectedRow={selectedRow} />
        </box>
      </box>
      {isFiltering && (
        <box flexDirection="row" paddingX={1} border={true} borderColor="magenta">
          <text>filter: </text>
          <input focused={true} placeholder="Type to filter..." onInput={(v: string) => setFilterText(v)} />
        </box>
      )}
      <Footer
        loading={loading || refreshing}
        lastRefreshed={lastRefreshed}
        errorCount={warnings.length}
        message={actionMessage}
        busyText={
          latestOp
            ? `${capitalize(VERBS[latestOp.kind])} ${latestOp.label}…${runningOps.length > 1 ? ` (+${runningOps.length - 1})` : ""}`
            : undefined
        }
        spinnerFrame={spinnerFrame}
        filter={filterText ? { term: filterText, matches: flatRows.length, total: totalRows } : undefined}
        onHintClick={handleHintClick}
        onErrorClick={() => setModal({ type: "warnings" })}
      />

      {modal.type === "help" && <HelpOverlay />}
      {modal.type === "history" && <HistoryOverlay />}
      {modal.type === "warnings" && (
        <WarningsOverlay
          warnings={warnings}
          onAcknowledge={() => {
            clearWarnings();
            setModal({ type: "none" });
          }}
          onClose={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "error" && (
        <ConfirmModal
          title="Error"
          message={modal.message}
          onConfirm={() => {
            setModal({ type: "none" });
            if (error) {
              renderer.destroy();
              process.exit(1);
            }
          }}
          onCancel={() => {
            setModal({ type: "none" });
            if (error) {
              renderer.destroy();
              process.exit(1);
            }
          }}
        />
      )}
      {modal.type === "confirm_remove" && (
        <ConfirmModal
          title={`Remove ${modal.rows.length} Worktree(s)`}
          message={(() => {
            const count = modal.rows.length;
            const lines = [`Are you sure you want to remove ${count === 1 ? modal.rows[0]?.branch : count + " worktrees"}?`];
            const dirty = modal.rows.filter(r => r.dirtyFiles.length > 0);
            if (dirty.length > 0) {
              lines.push("");
              lines.push("WARNING: Uncommitted changes will be discarded for:");
              dirty.forEach(r => {
                lines.push(`  - ${r.branch} (${r.dirtyFiles.length} dirty file${r.dirtyFiles.length > 1 ? 's' : ''})`);
              });
            }
            return lines.join("\n");
          })()}
          onConfirm={() => {
            const rows = modal.rows;
            setModal({ type: "none" });
            startBatchActions("remove", rows, (r) => {
              const args = ["remove", r.branch, "--repo", r.repoName, "--yes"];
              const needsForce = r.dirtyFiles.length > 0 || !existsSync(r.path);
              if (needsForce) args.push("--force");
              return args;
            });
          }}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "confirm_rebase" && (
        <ConfirmModal
          title={`Rebase ${modal.rows.length} Worktree(s)`}
          message={`Are you sure you want to fetch and rebase ${modal.rows.length === 1 ? modal.rows[0]?.branch : modal.rows.length + " worktrees"}?`}
          onConfirm={() => {
            const rows = modal.rows;
            setModal({ type: "none" });
            startBatchActions("rebase", rows, (r) => ["rebase", r.branch, "--repo", r.repoName]);
          }}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "confirm_sync" && (
        <ConfirmModal
          title={`Sync ${modal.rows.length} Worktree(s)`}
          message={`Are you sure you want to sync ${modal.rows.length === 1 ? modal.rows[0]?.branch : modal.rows.length + " worktrees"}?`}
          onConfirm={() => {
            const rows = modal.rows;
            setModal({ type: "none" });
            startBatchActions("sync", rows, (r) => ["sync", r.branch, "--repo", r.repoName]);
          }}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {createModal && (
        <InputModal
          title={`New worktree branch in ${selectedRow?.repoName ?? ""}`}
          placeholder="Branch name (empty to cancel)"
          errorMessage={createError}
          onSubmit={(value) => {
            const branch = value.trim();
            if (!branch) {
              setCreateModal(false);
              return;
            }
            if (!validateSafeBranchName(branch)) {
              setCreateError("Invalid branch name");
              return;
            }
            const repoName = selectedRow?.repoName;
            if (!repoName) return;
            if (busyRepos.has(repoName)) {
              setCreateError(`${repoName} is busy`);
              return;
            }
            setCreateModal(false);
            setCreateError(undefined);
            setCreateBaseError(undefined);
            setCreateBaseModal({ branch, repoName });
          }}
        />
      )}

      {createBaseModal && (
        <InputModal
          title={`Base ref for ${createBaseModal.branch}`}
          placeholder="origin/main (empty for default main)"
          errorMessage={createBaseError}
          onSubmit={(value) => {
            const base = value.trim();
            if (base && !validateSafeBranchName(base)) {
              setCreateBaseError("Invalid base ref");
              return;
            }
            const { branch, repoName } = createBaseModal;
            setCreateBaseModal(null);
            setCreateBaseError(undefined);
            setCreateDepsChoice({ branch, repoName, base: base || undefined });
          }}
        />
      )}

      {createDepsChoice && (
        <ChoiceModal
          title={`Dependencies for ${createDepsChoice.branch}`}
          options={DEPS_CHOICES}
          onSubmit={(choice) => {
            const { branch, repoName, base } = createDepsChoice;
            setCreateDepsChoice(null);
            startCreate(branch, repoName, choice, base);
          }}
          onCancel={() => setCreateDepsChoice(null)}
        />
      )}

      {pullPrModal && (
        <InputModal
          title={`Pull PR into ${selectedRow?.repoName ?? ""}`}
          placeholder="https://github.com/owner/repo/pull/123"
          errorMessage={pullPrError}
          onSubmit={(value) => {
            const link = value.trim();
            if (!link) {
              setPullPrModal(false);
              return;
            }
            if (!link.includes("github.com") || !link.includes("/pull/")) {
              setPullPrError("Invalid PR link: expected https://github.com/{owner}/{repo}/pull/{N}");
              return;
            }
            const repoName = selectedRow?.repoName;
            if (!repoName) {
              setPullPrError("No repo selected");
              return;
            }
            if (busyRepos.has(repoName)) {
              setPullPrError(`${repoName} is busy`);
              return;
            }
            setPullPrModal(false);
            setPullPrError(undefined);
            setPullForceChoice({ link, repoName });
          }}
        />
      )}

      {pullForceChoice && (
        <ChoiceModal
          title={`Pull ${pullForceChoice.link.split("/").pop()}?`}
          options={[
            { value: "normal", label: "Pull (skip if exists)", desc: "Fails if branch already exists" },
            { value: "force", label: "Force Override", desc: "Remove existing branch/worktree and recreate" },
          ]}
          onSubmit={(choice) => {
            const { link, repoName } = pullForceChoice;
            setPullForceChoice(null);
            startPullPr(link, repoName, choice === "force");
          }}
          onCancel={() => setPullForceChoice(null)}
        />
      )}

      {renameModal && selectedRow && (
        <InputModal
          title={`Rename branch ${selectedRow.branch}`}
          initialValue={selectedRow.branch}
          placeholder="New branch name"
          errorMessage={renameError}
          onSubmit={(value) => {
            const target = selectedRow;
            const to = value.trim();
            if (!to) {
              setRenameModal(false);
              return;
            }
            if (to === target.branch) {
              setRenameModal(false);
              return;
            }
            if (!validateSafeBranchName(to)) {
              setRenameError("Invalid branch name");
              return;
            }
            setRenameModal(false);
            setRenameError(undefined);
            setModal({ type: "confirm_rename", row: target, to });
          }}
        />
      )}

      {modal.type === "confirm_rename" && (
        <ConfirmModal
          title="Rename Worktree"
          message={[
            `${modal.row.branch} → ${modal.to}`,
            "",
            `Branch will be renamed and the checkout moved to:`,
            getWorktreePathFor(modal.row.repoName, modal.to),
            "",
            "Uncommitted changes and synced files move with it.",
            "Proceed?",
          ].join("\n")}
          onConfirm={() => {
            const { row, to } = modal;
            setModal({ type: "none" });
            const op: PendingOp = {
              id: nextOpId.current++,
              kind: "rename",
              repoNames: [row.repoName],
              rowPath: row.path,
              branch: row.branch,
              label: `${row.branch} → ${to}`,
              title: `Rename ${row.branch} → ${to}`,
              status: "queued",
              lines: [],
            };
            setOps((prev) => [...prev, op]);
            void executeOp(op, ["rename", row.branch, to, "--repo", row.repoName], [row.repoName]);
          }}
          onCancel={() => setModal({ type: "none" })}
        />
      )}

      {configOpen && (
        <ConfigOverlay
          onClose={() => setConfigOpen(false)}
          onSaved={() => void doRefresh()}
          onError={(msg) => setModal({ type: "error", message: msg })}
        />
      )}

      {failedLogs.length > 0 && (
        <ActionLogModal
          title={failedLogs[0]!.title}
          lines={failedLogs[0]!.lines}
          done={true}
          exitCode={failedLogs[0]!.exitCode}
          remaining={failedLogs.length - 1}
        />
      )}
    </box>
  );
}
