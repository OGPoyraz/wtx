import { useTheme } from "../theme.js";
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
  changesFocused?: boolean;
  onChangesFocus?: () => void;
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
  changesFocused,
  onChangesFocus,
  activeTabId,
  recentSessionIds,
  terminalSessions,
}: TabPaneProps) {
  const theme = useTheme();
  const borderColor = focused ? theme.accent : theme.border;
  const mountedSessions = allSessionsFlat?.filter((s) => activeTabId === s.id || recentSessionIds?.has(s.id));

  const nonSessionTabs = tabs.filter((t) => !t.closable);

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
        {nonSessionTabs.map((t) => {
          const isChanges = t.id === "changes";
          const tabFocused = isChanges ? !!changesFocused : !terminalFocused && !changesFocused && t.id === activeId;
          const content = t.render({ worktree: selectedRow, isActive: t.id === activeId, focused: tabFocused } as any);
          if (isChanges) {
            return (
              <box key={t.id} flexGrow={1} width="100%" flexDirection="column" visible={t.id === activeId} onMouseDown={() => onChangesFocus?.()}>
                {content}
              </box>
            );
          }
          return (
            <box key={t.id} flexGrow={1} width="100%" flexDirection="column" visible={t.id === activeId}>
              {content}
            </box>
          );
        })}
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
        {nonSessionTabs.length === 0 && (!mountedSessions || mountedSessions.length === 0) && <text fg={theme.dim}>No tab</text>}
      </box>
    </box>
  );
}
