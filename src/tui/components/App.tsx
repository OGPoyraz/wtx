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

export interface AppProps {
  opts: GlobalOptions;
}

type ModalState = 
  | { type: "none" }
  | { type: "help" }
  | { type: "confirm_remove"; row: WorktreeRow }
  | { type: "confirm_rebase"; row: WorktreeRow }
  | { type: "confirm_sync"; row: WorktreeRow }
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

  useEffect(() => {
    if (error) {
      setModal({ type: "error", message: error });
    }
  }, [error]);

  const flatRows = blocks.flatMap(b => b.rows);
  const maxIndex = Math.max(0, flatRows.length - 1);

  useEffect(() => {
    if (selectedIndex > maxIndex && maxIndex >= 0) {
      setSelectedIndex(maxIndex);
    }
  }, [maxIndex, selectedIndex]);

  const selectedRow = flatRows[selectedIndex] ?? null;

  const startAction = async (title: string, args: string[]) => {
    setActionRun({ title, lines: [], done: false, exitCode: null });
    
    const result = await runWtxAction(args, (text, type) => {
      setActionRun(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: [...prev.lines, { text, type }]
        };
      });
    });

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
  };

  useKeyboard(
    (key) => {
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
            const row = modal.row;
            const action = modal.type;
            setModal({ type: "none" });

            if (action === "confirm_remove") {
              startAction(`Remove ${row.branch}`, ["remove", row.branch, "--repo", row.repoName]);
            } else if (action === "confirm_rebase") {
              startAction(`Rebase ${row.branch}`, ["rebase", row.branch, "--repo", row.repoName]);
            } else {
              startAction(`Sync ${row.branch}`, ["sync", row.branch, "--repo", row.repoName]);
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
        renderer.destroy();
        process.exit(0);
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
        if (!selectedRow) return;
        startAction(`Open ${selectedRow.branch}`, ["open", selectedRow.branch, "--repo", selectedRow.repoName]);
      } else if (key.name === "d") {
        if (!selectedRow) return;
        if (selectedRow.isMainCheckout) {
          setActionMessage("Cannot remove main checkout");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        setModal({ type: "confirm_remove", row: selectedRow });
      } else if (key.name === "b") {
        if (!selectedRow) return;
        if (selectedRow.isMainCheckout) {
          setActionMessage("Cannot rebase main checkout");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        setModal({ type: "confirm_rebase", row: selectedRow });
      } else if (key.name === "s") {
        if (!selectedRow) return;
        if (selectedRow.isMainCheckout) {
          setActionMessage("Cannot sync main checkout");
          setTimeout(() => setActionMessage(undefined), 3000);
          return;
        }
        setModal({ type: "confirm_sync", row: selectedRow });
      }
    }
  );

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" flexGrow={1}>
        <WorktreeTable blocks={blocks} selectedIndex={selectedIndex} />
        <DetailPane selectedRow={selectedRow} />
      </box>
      <Footer 
        loading={loading} 
        lastRefreshed={lastRefreshed} 
        errorCount={warnings.length} 
        message={actionMessage}
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
          title="Remove Worktree" 
          message={`Are you sure you want to remove ${modal.row.branch}?`} 
        />
      )}
      {modal.type === "confirm_rebase" && (
        <ConfirmModal 
          title="Rebase Worktree" 
          message={`Are you sure you want to fetch and rebase ${modal.row.branch}?`} 
        />
      )}
      {modal.type === "confirm_sync" && (
        <ConfirmModal 
          title="Sync Worktree" 
          message={`Are you sure you want to sync ${modal.row.branch}?`} 
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
