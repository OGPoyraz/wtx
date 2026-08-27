import { tokens } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";

interface TabBarProps {
  tabs: { id: string; label: string; closable?: boolean }[];
  activeId: string;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onClose?: (id: string) => void;
}

function TabItem({
  id,
  label,
  closable,
  active,
  onSelect,
  onClose,
}: {
  id: string;
  label: string;
  closable?: boolean;
  active: boolean;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}) {
  const tap = useTapHandler(() => onSelect(id));
  const closeTap = useTapHandler((e) => {
    e.stopPropagation();
    onClose?.(id);
  });
  return (
    <box flexDirection="row" paddingRight={1} {...tap}>
      <text fg={active ? tokens.accent : tokens.dim} attributes={active ? 1 : 0}>
        {label}
      </text>
      {closable ? (
        <box {...closeTap} style={{ marginLeft: 1 }}>
          <text fg={active ? tokens.accent : tokens.dim}>✕</text>
        </box>
      ) : null}
      <text> </text>
    </box>
  );
}

export function TabBar({ tabs, activeId, onSelect, onClose }: TabBarProps) {
  return (
    <box flexDirection="row" width="100%" alignItems="center" paddingLeft={1}>
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          id={tab.id}
          label={tab.label}
          closable={tab.closable}
          active={tab.id === activeId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ))}
    </box>
  );
}
