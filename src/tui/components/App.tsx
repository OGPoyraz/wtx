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
import { InputModal } from "./InputModal.js";
import { ConfigOverlay } from "./ConfigOverlay.js";
import { matchesFilter, toggleSelection } from "../utils.js";
import { resolveAgentCommand, spawnAgentInWorktree } from "../../lib/agents.js";
import { loadConfig } from "../../lib/config.js";

export interface AppProps {
  opts: GlobalOptions;
}

type ModalState = 
  | { type: "none" }
  | { type: "help" }
  | { type: "confirm_remove"; rows: WorktreeRow[] }
  | { type: "confirm_rebase"; rows: WorktreeRow[] }
  | { type: "confirm_sync"; rows: WorktreeRow[] }
  | { type: "error"; message: string };

type ActionRunState = {
  title: string;
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

  const getSelectedRows = (): WorktreeRow[] => {
    if (selection.size > 0) {
      return blocks.flatMap(b => b.rows).filter(r => selection.has(r.path));
    }
    return selectedRow ? [selectedRow] : [];
  };

  const runSequentialActions = async (titlePrefix: string, targets: WorktreeRow[], actionArgs: (row: WorktreeRow) => string[]) => {
    for (const row of targets) {
      await startAction(`${titlePrefix} ${row.branch}`, actionArgs(row));
    }
    setSelection(new Set());
  };

  const startAction = async (title: string, args: string[]) => {
    return new Promise<void>((resolve) => {
      setActionRun({ title, lines: [], done: false, exitCode: null });
      
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
          refresh();
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

      if (actionRun) {
        if (!actionRun.done) {
          return;
        } else {
          setActionRun(null);
          refresh();
          return;
        }
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
        if (modal.type === "error" || modal.type === "help") {
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
              runSequentialActions("Remove", rows, (r) => ["remove", r.branch, "--repo", r.repoName]);
            } else if (action === "confirm_rebase") {
              runSequentialActions("Rebase", rows, (r) => ["rebase", r.branch, "--repo", r.repoName]);
            } else {
              runSequentialActions("Sync", rows, (r) => ["sync", r.branch, "--repo", r.repoName]);
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
          try {
            const config = await loadConfig();
            const cmdTemplate = resolveAgentCommand("claude", config.agents) ?? "claude"; 
            const result = await spawnAgentInWorktree(cmdTemplate, target.path, { repoName: target.repoName, branch: target.branch });
            setActionMessage(`Agent spawned (${result.mode}${result.session ? ` session ${result.session}` : ""})`);
            setTimeout(() => setActionMessage(undefined), 5000);
          } catch (e: any) {
            setActionMessage(`Agent failed: ${e.message}`);
          }
        })();
        return;
      }

      if (key.name === "down" || key.name === "j") {
        setSelectedIndex(prev => Math.min(prev + 1, maxIndex));
      } else if (key.name === "up" || key.name === "k") {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (key.name === "r") {
        refresh();
      } else if (key.name === "c") {
        setConfigOpen(true);
      } else if (key.name === "?") {
        setModal({ type: "help" });
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
        startAction(`Open ${target.branch}`, ["open", target.branch, "--repo", target.repoName]);
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
        <WorktreeTable blocks={filteredBlocks} selectedIndex={selectedIndex} selection={selection} />
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
        filter={filterText ? { term: filterText, matches: flatRows.length, total: totalRows } : undefined}
      />
      
      {modal.type === "help" && <HelpOverlay />}
      {modal.type === "error" && (
        <ConfirmModal 
          title="Error" 
          message={modal.message} 
        />
      )}
      {modal.type === "confirm_remove" && (
        <ConfirmModal 
          title={`Remove ${modal.rows.length} Worktree(s)`} 
          message={`Are you sure you want to remove ${modal.rows.length === 1 ? modal.rows[0]?.branch : modal.rows.length + " worktrees"}?`} 
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
              startAction(`Create ${branch}`, ["create", branch, "--repo", selectedRow.repoName]);
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

      {actionRun && (
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
