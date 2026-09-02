import { tokens } from "../theme.js";
import { TabBar } from "./TabBar.js";
import type { TabDef } from "./types.js";
import type { WorktreeRow } from "../types.js";
import { TerminalView } from "../components/TerminalView.js";
import type { TerminalSession } from "../hooks/useTerminalSessions.js";

interface TabPaneProps {
  selectedRow: WorktreeRow | null;
  tabs: TabDef[];
  activeId: string;
  focused: boolean;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onClose?: (id: string) => void;
  allSessionsFlat?: TerminalSession[];
  terminalFocused?: boolean;
  activeTabId?: string;
  recentSessionIds?: Set<string>;
  terminalSessions?: {
    sendInput: (repo: string, branch: string, path: string, id: string, data: string | Uint8Array) => void;
    resizeSession: (repo: string, branch: string, path: string, id: string, cols: number, rows: number) => void;
    registerListener: (id: string, fn: (data: Uint8Array) => void) => void;
    unregisterListener: (id: string) => void;
  };
}

export function TabPane({
  selectedRow,
  tabs,
  activeId,
  focused,
  canAdd,
  onSelect,
  onAdd,
  onClose,
  allSessionsFlat,
  terminalFocused,
  activeTabId,
  recentSessionIds,
  terminalSessions,
}: TabPaneProps) {
  const borderColor = focused ? tokens.accent : tokens.border;
  const mountedSessions = allSessionsFlat?.filter((s) => activeTabId === s.id || recentSessionIds?.has(s.id));

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      width="100%"
      height="100%"
      border={true}
      borderColor={borderColor}
      focusedBorderColor={borderColor}
      focusable={false}
      id="detail-pane"
    >
      <TabBar tabs={tabs} activeId={activeId} canAdd={canAdd} onSelect={onSelect} onAdd={onAdd} onClose={onClose} />
      <box flexGrow={1} width="100%" flexDirection="column">
        {tabs.map((t) => (
          <box key={t.id} flexGrow={1} width="100%" flexDirection="column" visible={t.id === activeId}>
            {t.render({ worktree: selectedRow, isActive: t.id === activeId, focused: focused && t.id === activeId })}
          </box>
        ))}
        {mountedSessions?.map((s) => (
          <box key={s.id} flexGrow={1} width="100%" height="100%" flexDirection="column" visible={activeTabId === s.id}>
            <TerminalView
              session={s}
              focused={!!(terminalFocused && activeTabId === s.id)}
              onFocus={() => {}}
              onSend={(data) => terminalSessions?.sendInput(s.repoName, s.branch, s.worktreePath, s.id, data)}
              onResize={(cols, rows) => terminalSessions?.resizeSession(s.repoName, s.branch, s.worktreePath, s.id, cols, rows)}
              registerListener={terminalSessions?.registerListener}
              unregisterListener={terminalSessions?.unregisterListener}
            />
          </box>
        ))}
        {tabs.length === 0 && (!mountedSessions || mountedSessions.length === 0) && <text fg={tokens.dim}>No tab</text>}
      </box>
    </box>
  );
}
