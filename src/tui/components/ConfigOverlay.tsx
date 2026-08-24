import { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { Overlay } from "./Overlay.js";
import { computeScrollWindow } from "../utils.js";
import { tokens } from "../theme.js";
import { loadConfig, saveConfig } from "../../lib/config.js";
import type { Config, RepoConfig } from "../../types.js";
import { InputModal } from "./InputModal.js";
import { ConfirmModal } from "./ConfirmModal.js";

export interface ConfigOverlayProps {
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

type ViewState = 
  | { type: "main" }
  | { type: "repo", name: string };

type EditState = 
  | { type: "none" }
  | { type: "input", key: string, title: string, currentValue: string, error?: string, isRepoContext?: boolean }
  | { type: "confirm_remove", repo: string };

interface GlobalRow {
  type: "global";
  key: keyof Config;
  label: string;
  desc: string;
  valueType: string;
}

interface RepoRow {
  type: "repo";
  name: string;
  desc: string;
}

type MainRow = 
  | { type: "header"; label: string }
  | GlobalRow
  | RepoRow
  | { type: "add_repo" };

interface RepoFieldRow {
  type: "repo_field";
  key: keyof RepoConfig;
  label: string;
  desc: string;
  valueType: string;
}

type DetailRow = 
  | { type: "header"; label: string }
  | RepoFieldRow
  | { type: "remove_repo" };

export function ConfigOverlay({ onClose, onSaved, onError }: ConfigOverlayProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [viewState, setViewState] = useState<ViewState>({ type: "main" });
  const [selectedIndex, setSelectedIndex] = useState(1);
  const [windowStart, setWindowStart] = useState(0);
  const [editState, setEditState] = useState<EditState>({ type: "none" });

  useEffect(() => {
    try {
      setConfig(loadConfig());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      onClose();
    }
  }, [onError, onClose]);

  const mainRows: MainRow[] = [];
  if (config) {
    mainRows.push({ type: "header", label: "GLOBAL" });
    mainRows.push({ type: "global", key: "root", label: "root", desc: "Repos root directory", valueType: "string" });
    mainRows.push({ type: "global", key: "postfix", label: "postfix", desc: "Worktree directory suffix", valueType: "string" });
    mainRows.push({ type: "global", key: "ide", label: "ide", desc: "Default IDE command", valueType: "string" });
    mainRows.push({ type: "global", key: "default_main_branch", label: "default_main_branch", desc: "Fallback when auto-detect fails", valueType: "string" });
    mainRows.push({ type: "global", key: "user", label: "user", desc: "GitHub username for ownership tagging", valueType: "string | null" });
    
    mainRows.push({ type: "header", label: "REPOS" });
    for (const name of Object.keys(config.repos)) {
      mainRows.push({ type: "repo", name, desc: `Repo: ${name}` });
    }
    mainRows.push({ type: "add_repo" });
  }

  const detailRows: DetailRow[] = [];
  if (config && viewState.type === "repo") {
    detailRows.push({ type: "header", label: `REPO: ${viewState.name}` });
    detailRows.push({ type: "repo_field", key: "main_branch", label: "main_branch", desc: "Main branch or 'auto'", valueType: "string" });
    detailRows.push({ type: "repo_field", key: "sync_files", label: "sync_files", desc: "Files to sync (comma separated)", valueType: "string[]" });
    detailRows.push({ type: "repo_field", key: "post_create", label: "post_create", desc: "Run after create (comma separated)", valueType: "string[]" });
    detailRows.push({ type: "repo_field", key: "post_sync", label: "post_sync", desc: "Run after sync (comma separated)", valueType: "string[]" });
    detailRows.push({ type: "repo_field", key: "pr", label: "pr", desc: "Create PRs by default", valueType: "boolean" });
    detailRows.push({ type: "repo_field", key: "forge", label: "forge", desc: "Forge integration", valueType: "'auto'|'github'" });
    detailRows.push({ type: "repo_field", key: "pr_repo", label: "pr_repo", desc: "Explicit PR repo override", valueType: "string | null" });
    detailRows.push({ type: "remove_repo" });
  }

  const activeRows = viewState.type === "main" ? mainRows : detailRows;

  // Make sure index is valid when rows change
  useEffect(() => {
    if (!activeRows || selectedIndex >= activeRows.length) {
      // Find last selectable
      let newIdx = activeRows.length - 1;
      while (newIdx > 0 && activeRows[newIdx]?.type === "header") {
        newIdx--;
      }
      setSelectedIndex(Math.max(0, newIdx));
    } else if (activeRows[selectedIndex] && activeRows[selectedIndex]?.type === "header") {
      setSelectedIndex(Math.min(selectedIndex + 1, activeRows.length - 1));
    }
  }, [activeRows.length, viewState.type]);

  const performSave = (newConfig: Config) => {
    try {
      saveConfig(newConfig);
      setConfig(newConfig);
      onSaved();
      setEditState({ type: "none" });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      // Attempt rollback to last good state (loadConfig again or just keep current state in memory)
      // Since it failed, file on disk is unchanged. State stays as last successful `config`.
      setEditState({ type: "none" });
    }
  };


  const visibleRowsCount = 22;

  // Windowing logic update
  if (activeRows.length > 0) {
    const newWindow = computeScrollWindow(selectedIndex, windowStart, visibleRowsCount, activeRows.length);
    if (newWindow.start !== windowStart) {
      setWindowStart(newWindow.start);
    }
  }

  useKeyboard((key) => {
    if (!config) return;

    if (editState.type !== "none") {
      if (editState.type === "confirm_remove") {
        if (key.name === "y") {
          handleConfirmRemove();
        } else if (key.name === "escape" || key.name === "q" || key.name === "n") {
          setEditState({ type: "none" });
        }
      } else if (editState.type === "input") {
        if (key.name === "escape") {
          setEditState({ type: "none" });
        }
      }
      return;
    }

    if (key.name === "escape" || key.name === "q") {
      if (viewState.type === "repo") {
        setViewState({ type: "main" });
        // find repo row
        const rowIdx = mainRows.findIndex(r => r.type === "repo" && r.name === viewState.name);
        if (rowIdx !== -1) setSelectedIndex(rowIdx);
      } else {
        onClose();
      }
      return;
    }

    if (key.name === "down" || key.name === "j") {
      let next = selectedIndex + 1;
      while (next < activeRows.length && activeRows[next]?.type === "header") {
        next++;
      }
      if (next < activeRows.length) {
        setSelectedIndex(next);
      }
    } else if (key.name === "up" || key.name === "k") {
      let prev = selectedIndex - 1;
      while (prev >= 0 && activeRows[prev]?.type === "header") {
        prev--;
      }
      if (prev >= 0) {
        setSelectedIndex(prev);
      }
    } else if (key.name === "return" || key.name === "enter") {
      const row = activeRows[selectedIndex];
      if (!row) return;
      if (!row) return;

      if (row.type === "global") {
        let val = config[row.key];
        setEditState({
          type: "input",
          key: row.key as string,
          title: `Edit ${row.key}`,
          currentValue: val === null ? "" : String(val),
          isRepoContext: false
        });
      } else if (row.type === "add_repo") {
        setEditState({
          type: "input",
          key: "__add_repo",
          title: "Add Repo Name",
          currentValue: "",
          isRepoContext: false
        });
      } else if (row.type === "repo") {
        setViewState({ type: "repo", name: row.name });
        setSelectedIndex(1);
      } else if (row.type === "repo_field") {
        const repoName = (viewState as Extract<ViewState, {type: "repo"}>).name;
        const repoConf = config.repos[repoName] as RepoConfig;
        if (!repoConf) return;
        if (row.key === "pr") {
          const newConf = { ...config, repos: { ...config.repos, [repoName]: { ...repoConf, pr: !repoConf.pr } as RepoConfig } };
          performSave(newConf);
        } else if (row.key === "forge") {
          const nextForge = repoConf.forge === "auto" ? "github" : "auto";
          const newConf = { ...config, repos: { ...config.repos, [repoName]: { ...repoConf, forge: nextForge } as RepoConfig } };
          performSave(newConf);
        } else {
          let val = repoConf[row.key];
          let strVal = "";
          if (Array.isArray(val)) {
            strVal = val.join(",");
          } else if (val !== null && val !== undefined) {
            strVal = String(val);
          }
          setEditState({
            type: "input",
            key: row.key as string,
            title: `Edit ${row.key} for ${repoName}`,
            currentValue: strVal,
            isRepoContext: true
          });
        }
      } else if (row.type === "remove_repo") {
        const repoName = (viewState as Extract<ViewState, {type: "repo"}>).name;
        setEditState({ type: "confirm_remove", repo: repoName });
      }
    }
  });

  const handleInputSubmit = (value: string) => {
    if (!config || editState.type !== "input") return;
    
    if (editState.key === "__add_repo") {
      const name = value.trim();
      if (!name) {
        setEditState(s => ({ ...s, error: "Repo name required" }));
        return;
      }
      if (config.repos[name]) {
        setEditState(s => ({ ...s, error: "Repo already exists" }));
        return;
      }
      const newConf = {
        ...config,
        repos: {
          ...config.repos,
          [name]: { main_branch: "auto", pr: true, forge: "auto", pr_repo: null } as RepoConfig
        }
      };
      performSave(newConf);
      return;
    }

    if (!editState.isRepoContext) {
      // Global
      const key = editState.key as keyof Config;
      if (key === "root" || key === "postfix" || key === "ide") {
        if (!value.trim()) {
          setEditState(s => ({ ...s, error: "Value required" }));
          return;
        }
      }
      let finalVal: string | null = value.trim();
      if (key === "user" && finalVal === "") {
        finalVal = null;
      }
      
      const newConf = { ...config, [key]: finalVal };
      performSave(newConf);
    } else {
      // Repo
      if (viewState.type !== "repo") return;
      const repoName = viewState.name;
      const repoConf = config.repos[repoName] as RepoConfig;
        if (!repoConf) return;
      const key = editState.key as keyof RepoConfig;
      
      let finalVal: any = value.trim();
      if (key === "sync_files" || key === "post_create" || key === "post_sync") {
        finalVal = value.split(",").map(v => v.trim()).filter(Boolean);
      } else if (key === "pr_repo") {
        if (finalVal === "") finalVal = null;
      }
      
      const newConf = {
        ...config,
        repos: {
          ...config.repos,
          [repoName]: { ...repoConf, [key]: finalVal } as RepoConfig
        }
      };
      performSave(newConf);
    }
  };

  const handleConfirmRemove = () => {
    if (!config || editState.type !== "confirm_remove") return;
    const repoName = editState.repo;
    const newRepos = { ...config.repos };
    delete newRepos[repoName];
    const newConf = { ...config, repos: newRepos };
    setViewState({ type: "main" });
    performSave(newConf);
  };

  if (!config) return null;

  const rowData = activeRows[selectedIndex] || null;
  let hint = "";
  if (rowData && rowData.type !== "header") {
    if (rowData.type === "global" || rowData.type === "repo_field") {
      hint = `${rowData.label} (${rowData.valueType}): ${rowData.desc}`;
    } else if (rowData.type === "repo") {
      hint = rowData.desc;
    } else if (rowData.type === "add_repo") {
      hint = "Add a new repository";
    } else if (rowData.type === "remove_repo") {
      hint = "Remove this repository from config";
    }
  }

  return (
    <>
      <Overlay title="Configuration" borderColor={tokens.border}>
        <box flexDirection="column" width="100%" height={24}>
          <box flexDirection="column" flexGrow={1} overflow="hidden">
            {activeRows.slice(windowStart, windowStart + visibleRowsCount).map((row, idx) => {
              const i = windowStart + idx;
              const isSelected = i === selectedIndex;
              if (row.type === "header") {
                return (
                  <text key={i} fg={tokens.dim} style={{ marginTop: i === 0 ? 0 : 1 }}>
                    {row.label}
                  </text>
                );
              }
              
              let labelText = "";
              let valText = "";
              if (row.type === "global") {
                labelText = row.label;
                const v = config[row.key];
                valText = v === null ? "null" : String(v);
              } else if (row.type === "repo") {
                labelText = row.name;
                valText = "";
              } else if (row.type === "add_repo") {
                labelText = "+ add repo";
              } else if (row.type === "repo_field") {
                labelText = row.label;
                const currentRepoConf = config.repos[(viewState as Extract<ViewState, {type:"repo"}>).name] as RepoConfig | undefined;
                const v = currentRepoConf ? currentRepoConf[row.key] : null;
                if (Array.isArray(v)) valText = `[${v.join(", ")}]`;
                else valText = v === null ? "null" : String(v);
              } else if (row.type === "remove_repo") {
                labelText = "Remove this repo";
                valText = "";
              }

              return (
                <box key={i} flexDirection="row" width="100%">
                  <text 
                    fg={isSelected ? tokens.bright : tokens.fg}
                    bg={isSelected ? tokens.selectionBg : undefined}
                    width={24}
                  >
                    {isSelected ? "> " : "  "}{labelText}
                  </text>
                  {valText && (
                    <text 
                      fg={isSelected ? tokens.accent : tokens.dim}
                      bg={isSelected ? tokens.selectionBg : undefined}
                      flexShrink={1}
                      
                    >
                      {valText}
                    </text>
                  )}
                </box>
              );
            })}
          </box>
          <box 
            flexDirection="row" 
            border={true} 
            borderColor={tokens.border} 
            paddingTop={1} 
            marginTop={1}
            minHeight={3}
          >
            <text fg={tokens.dim}>{hint}</text>
          </box>
        </box>
      </Overlay>
      
      {editState.type === "input" && (
        <InputModal
          title={editState.title}
          placeholder={editState.currentValue || "Enter value..."}
          errorMessage={editState.error}
          onSubmit={handleInputSubmit}
        />
      )}

      {editState.type === "confirm_remove" && (
        <ConfirmModal
          title="Remove Repo"
          message={`Remove repo ${editState.repo} from config?`}
        />
      )}
    </>
  );
}
