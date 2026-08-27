import { tokens } from "../theme.js";
import { TabBar } from "./TabBar.js";
import type { TabDef } from "./types.js";
import type { WorktreeRow } from "../types.js";

interface TabPaneProps {
  selectedRow: WorktreeRow | null;
  tabs: TabDef[];
  activeId: string;
  focused: boolean;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onClose?: (id: string) => void;
  onFocusTerminal?: () => void;
  onBlurTerminal?: () => void;
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
  onFocusTerminal: _onFocusTerminal,
  onBlurTerminal: _onBlurTerminal,
}: TabPaneProps) {
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;

  const borderColor = focused ? tokens.accent : tokens.border;

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
        {activeTab ? activeTab.render({ worktree: selectedRow, isActive: true }) : <text fg={tokens.dim}>No tab</text>}
      </box>
    </box>
  );
}
