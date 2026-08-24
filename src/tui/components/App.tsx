import { useState, useEffect } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { GlobalOptions } from "../../types.js";
import { useWorktrees } from "../hooks/useWorktrees.js";
import { WorktreeTable } from "./WorktreeTable.js";
import { DetailPane } from "./DetailPane.js";
import { Footer } from "./Footer.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { runWtxAction } from "../actions.js";
import { validateSafeBranchName } from "../../lib/git.js";
import type { WorktreeRow } from "../types.js";
import { ActionLogModal } from "./ActionLogModal.js";
import { HistoryOverlay } from "./HistoryOverlay.js";
import { InputModal } from "./InputModal.js";
import { ConfigOverlay } from "./ConfigOverlay.js";
import { matchesFilter, toggleSelection } from "../utils.js";
import { resolveAgentCommand, spawnAgentInWorktree } from "../../lib/agents.js";
import { loadConfig } from "../../lib/config.js";
import { appendHistory } from "../../lib/history.js";
import { useSpinnerFrame } from "../hooks/useSpinnerFrame.js";

export interface AppProps {
  opts: GlobalOptions;
}

type ModalState = 
  | { type: "none" }
  | { type: "help" }
  | { type: "history" }
  | { type: "confirm_remove"; rows: WorktreeRow[] }
  | { type: "confirm_rebase"; rows: WorktreeRow[] }
  | { type: "confirm_sync"; rows: WorktreeRow[] }
  | { type: "error"; message: string };

type BusyKind = "create" | "remove" | "rebase" | "sync" | "fetch" | "open";

const VERBS: Record<BusyKind, string> = {
  create: "creating worktree",
  remove: "deleting",
  rebase: "rebasing",
  sync: "syncing",
  fetch: "fetching",
  open: "opening",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface BusyState {
  kind: BusyKind;
  repoNames: string[];
  rowPath?: string;
}

type ActionRunState = BusyState & {
  title: string;
  label: string;
  lines: { text: string; type: "out" | "err" }[];
  done: boolean;
  exitCode: number | null;
};

export function App({ opts }: AppProps) {
  const renderer = useRenderer();
  const { blocks, loading, error, warnings, lastRefreshed, refresh } = useWorktrees(opts);
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  
  const [actionRun, setActionRun] = useState<ActionRunState | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [configOpen, setConfigOpen] = useState(false);

  const [filterText, setFilterText] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (error) {
      setModal({ type: "error", message: error });
    }
  }, [error]);

  const filteredBlocks = blocks.map(b => ({
    ...b,
    rows: b.rows.filter(r => matchesFilter(r, filterText))
  })).filter(b => b.rows.length > 0);

  const flatRows = filteredBlocks.flatMap(b => b.rows);
  const totalRows = blocks.flatMap(b => b.rows).length;
  const maxIndex = Math.max(0, flatRows.length - 1);

  useEffect(() => {
    if (selectedIndex > maxIndex && maxIndex >= 0) {
      setSelectedIndex(maxIndex);
    }
  }, [maxIndex, selectedIndex]);

  const selectedRow = flatRows[selectedIndex] ?? null;

  const busy: BusyState | null =
    actionRun !== null && !actionRun.done
      ? { kind: actionRun.kind, repoNames: actionRun.repoNames, rowPath: actionRun.rowPath }
      : null;
  const spinnerFrame = useSpinnerFrame(busy !== null || loading);

  const getSelectedRows = (): WorktreeRow[] => {
    if (selection.size > 0) {
      return blocks.flatMap(b => b.rows).filter(r => selection.has(r.path));
    }
    return selectedRow ? [selectedRow] : [];
  };

  const runSequentialActions = async (kind: BusyKind, targets: WorktreeRow[], actionArgs: (row: WorktreeRow) => string[]) => {
    for (const row of targets) {
      await startAction(kind, `${capitalize(VERBS[kind])} ${row.branch}`, row.branch, [row.repoName], row.path, actionArgs(row));
    }
    setSelection(new Set());
  };

  const startAction = async (kind: BusyKind, title: string, label: string, repoNames: string[], rowPath: string | undefined, args: string[]) => {
    return new Promise<void>((resolve) => {
      setActionRun({ kind, repoNames, rowPath, title, label, lines: [], done: false, exitCode: null });
      runWtxAction(args, (text, type) => {
        setActionRun(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            lines: [...prev.lines, { text, type }]
          };
        });
      }).then((result) => {
        if (result.exitCode === 0) {
          setActionRun(null);
        } else {
          setActionRun(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              done: true,
              exitCode: result.exitCode
            };
          });
        }
        refresh();
        resolve();
      });
    });
  };

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

      if (loading || busy) {
        return;
      }

      if (actionRun) {
        setActionRun(null);
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

      // Modal handling
      if (modal.type !== "none") {
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
          modal.type === "confirm_sync"
        ) {
          if (key.name === "y") {
            const rows = modal.rows;
            const action = modal.type;
            setModal({ type: "none" });

            if (action === "confirm_remove") {
              runSequentialActions("remove", rows, (r) => {
                const args = ["remove", r.branch, "--repo", r.repoName, "--yes"];
                if (r.dirtyFiles.length > 0) args.push("--force");
                return args;
              });
            } else if (action === "confirm_rebase") {
              runSequentialActions("rebase", rows, (r) => ["rebase", r.branch, "--repo", r.repoName]);
            } else {
              runSequentialActions("sync", rows, (r) => ["sync", r.branch, "--repo", r.repoName]);
            }
            return;
          }

          if (key.name === "n" || key.name === "escape" || key.name === "q") {
            setModal({ type: "none" });
          }
          return;
        }
      }

      // Normal navigation
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

      if (key.name === "a") {
        (async () => {
          const targets = getSelectedRows();
          if (targets.length === 0) return;
          const target = targets[0]; // Agent runs on first target or solo selection
          if (!target) return;
          const startedAt = Date.now();
          try {
            const config = await loadConfig();
            const cmdTemplate = resolveAgentCommand("claude", config.agents) ?? "claude";
            const result = await spawnAgentInWorktree(cmdTemplate, target.path, { repoName: target.repoName, branch: target.branch });
            appendHistory({
              ts: new Date().toISOString(),
              source: "terminal",
              command: "agent",
              args: ["agent", target.branch, "--repo", target.repoName],
              durationMs: Date.now() - startedAt,
              exit: 0,
            });
            setActionMessage(`Agent spawned (${result.mode}${result.session ? ` session ${result.session}` : ""})`);
            setTimeout(() => setActionMessage(undefined), 5000);
          } catch (e: any) {
            appendHistory({
              ts: new Date().toISOString(),
              source: "terminal",
              command: "agent",
              args: ["agent", target.branch, "--repo", target.repoName],
              durationMs: Date.now() - startedAt,
              exit: 1,
            });
            setActionMessage(`Agent failed: ${e.message}`);
          }
        })();
        return;
      }

      if (key.name === "f") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        const repoNames = [...new Set(targets.map((t) => t.repoName))];
        const label = repoNames.length === 1 ? repoNames[0]! : `${repoNames.length} repos`;
        startAction("fetch", `Fetch ${label}`, label, repoNames, undefined, ["fetch", "--repo", repoNames.join(",")])
          .then(() => setSelection(new Set()));
        return;
      } else if (key.name === "down" || key.name === "j") {
        setSelectedIndex(prev => Math.min(prev + 1, maxIndex));
      } else if (key.name === "up" || key.name === "k") {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (key.name === "r") {
        refresh();
      } else if (key.name === "c") {
        setConfigOpen(true);
      } else if (key.name === "?" || key.name === "H" || (key.name === "h" && key.shift)) {
        if (key.name === "?") {
          setModal({ type: "help" });
        } else {
          setModal({ type: "history" });
        }
      } else if (key.name === "n") {
        if (!selectedRow) return;
        setCreateModal(true);
        setCreateError(undefined);
      } else if (key.name === "o") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.length > 1) {
          setActionMessage("Cannot open multiple worktrees");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        const target = targets[0];
        if (!target) return;
        startAction("open", `Open ${target.branch}`, target.branch, [target.repoName], target.path, ["open", target.branch, "--repo", target.repoName]);
      } else if (key.name === "d" || (key.name === "D" && key.shift)) {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some(r => r.isMainCheckout)) {
          setActionMessage("Cannot remove main checkout");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        setModal({ type: "confirm_remove", rows: targets });
      } else if (key.name === "b" || key.name === "R" || (key.name === "r" && key.shift)) {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some(r => r.isMainCheckout)) {
          setActionMessage("Cannot rebase main checkout");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        setModal({ type: "confirm_rebase", rows: targets });
      } else if (key.name === "s") {
        const targets = getSelectedRows();
        if (targets.length === 0) return;
        if (targets.some(r => r.isMainCheckout)) {
          setActionMessage("Cannot sync main checkout");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        setModal({ type: "confirm_sync", rows: targets });
      }
    }
  );

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" flexGrow={1}>
        <WorktreeTable
          blocks={filteredBlocks}
          selectedIndex={selectedIndex}
          selection={selection}
          busy={
            busy
              ? { repoNames: busy.repoNames, rowPath: busy.rowPath, verb: VERBS[busy.kind], frame: spinnerFrame }
              : undefined
          }
        />
        <DetailPane selectedRow={selectedRow} />
      </box>
      {isFiltering && (
        <box flexDirection="row" paddingX={1} border={true} borderColor="magenta">
          <text>filter: </text>
          <input focused={true} placeholder="Type to filter..." onInput={(v: string) => setFilterText(v)} />
        </box>
      )}
      <Footer 
        loading={loading} 
        lastRefreshed={lastRefreshed} 
        errorCount={warnings.length} 
        message={actionMessage}
        busyText={
          actionRun && !actionRun.done
            ? `${capitalize(VERBS[actionRun.kind])} ${actionRun.label}…`
            : undefined
        }
        spinnerFrame={spinnerFrame}
        filter={filterText ? { term: filterText, matches: flatRows.length, total: totalRows } : undefined}
      />
      
      {modal.type === "help" && <HelpOverlay />}
      {modal.type === "history" && <HistoryOverlay />}
      {modal.type === "error" && (
        <ConfirmModal 
          title="Error" 
          message={modal.message} 
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
        />
      )}
      {modal.type === "confirm_rebase" && (
        <ConfirmModal 
          title={`Rebase ${modal.rows.length} Worktree(s)`} 
          message={`Are you sure you want to fetch and rebase ${modal.rows.length === 1 ? modal.rows[0]?.branch : modal.rows.length + " worktrees"}?`} 
        />
      )}
      {modal.type === "confirm_sync" && (
        <ConfirmModal 
          title={`Sync ${modal.rows.length} Worktree(s)`} 
          message={`Are you sure you want to sync ${modal.rows.length === 1 ? modal.rows[0]?.branch : modal.rows.length + " worktrees"}?`} 
        />
      )}
      {createModal && (
        <InputModal
          title="New worktree branch"
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
            setCreateModal(false);
            if (selectedRow) {
              startAction("create", `Create ${branch}`, `${branch} in ${selectedRow.repoName}`, [selectedRow.repoName], undefined, ["create", branch, "--repo", selectedRow.repoName]);
            }
          }}
        />
      )}
      
      {configOpen && (
        <ConfigOverlay
          onClose={() => setConfigOpen(false)}
          onSaved={() => refresh()}
          onError={(msg) => setModal({ type: "error", message: msg })}
        />
      )}

      {actionRun?.done && (
        <ActionLogModal
          title={actionRun.title}
          lines={actionRun.lines}
          done={actionRun.done}
          exitCode={actionRun.exitCode}
        />
      )}
    </box>
  );
}
