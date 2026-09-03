import { Overlay } from "./Overlay.js";
import { useTheme } from "../theme.js";

type HelpGroup = {
  title: string;
  entries: [string, string][];
};

const HELP_GROUPS: HelpGroup[] = [
  {
    title: "Navigation & Filtering",
    entries: [
      ["↑/↓, k/j", "Navigate list"],
      ["/", "Filter list"],
      ["Space", "Multi-select"],
      ["q/esc", "Quit"],
    ],
  },
  {
    title: "Worktree Lifecycle",
    entries: [
      ["n", "Create new worktree (pick dependency strategy)"],
      ["d", "Remove selected worktree(s)"],
      ["m", "Rename selected worktree (branch + directory)"],
      ["o", "Open selected in IDE"],
      ["f", "Fetch main for selected repo(s)"],
      ["p", "Pull latest changes for selected branch(es)"],
      ["P (shift+p)", "Pull PR by link (force-override if exists)"],
      ["b", "Rebase selected onto base (or main)"],
      ["s", "Sync selected (env files + hooks)"],
      ["i", "Install dependencies in selection (worktrees and main)"],
    ],
  },
  {
    title: "Favorites & Workspaces",
    entries: [
      ["F (shift+f)", "Pin/unpin selected repo (favorites float to top)"],
      ["W (shift+w)", "Scope list to a workspace's members (press again to clear)"],
    ],
  },
  {
    title: "Terminal & Tabs",
    entries: [
      ["t", "New terminal session (max 5 per worktree)"],
      ["click tab", "Switch Details / Changes / Session tabs"],
      ["Ctrl+G / click table", "Leave terminal focus — focused terminal gets all keys"],
    ],
  },
  {
    title: "Changes Explorer (only for dirty worktrees)",
    entries: [
      ["click Changes", "Focus pane — j/k navigates files, s/Tab cycles scope"],
      ["s / Tab", "Cycle scope: worktree (dirty+untracked) → staged → base (vs base branch)"],
      ["j / k, ↑/↓", "Navigate files (when Changes focused, Ctrl+G/Esc to unfocus)"],
    ],
  },
  {
    title: "View & System",
    entries: [
      ["T (shift+t)", "Cycle theme presets"],
      ["c", "Open configuration"],
      ["e", "View data warnings (when count > 0)"],
      ["r", "Refresh data"],
      ["H", "Action history"],
      ["?", "Toggle help"],
      ["mouse drag", "Select text — copied to clipboard automatically"],
      ["ctrl+shift+c", "Copy selection again (terminals reserve cmd+c)"],
      ["click PR #/URL", "Open pull request in browser"],
    ],
  },
];

export function HelpOverlay({ withoutDetails = false }: { withoutDetails?: boolean }) {
  const theme = useTheme();
  const groups = withoutDetails
    ? HELP_GROUPS.filter((g) => g.title !== "Terminal & Tabs" && !g.title.startsWith("Changes Explorer"))
    : HELP_GROUPS;
  return (
    <Overlay title={withoutDetails ? "Help (repositories only)" : "Help"} borderColor={theme.border} width={100}>
      <box flexDirection="column" style={{ maxHeight: 38 }}>
        <scrollbox flexGrow={1}>
          {groups.map((group) => (
            <box key={group.title} flexDirection="column" style={{ marginBottom: 1 }}>
              <box style={{ marginBottom: 1 }}>
                <text fg={theme.accent} attributes={1}>{group.title}</text>
              </box>
              {group.entries.map(([key, desc]) => (
                <box key={key} flexDirection="row" gap={1}>
                  <box width={22} flexShrink={0} justifyContent="flex-end">
                    <text fg={theme.accent}>{key}</text>
                  </box>
                  <text fg={theme.dim}>-</text>
                  <box flexGrow={1}>
                    <text fg={theme.fg}>{desc}</text>
                  </box>
                </box>
              ))}
            </box>
          ))}
        </scrollbox>
      </box>
      <text style={{ marginTop: 1, fg: theme.dim }}>Press any key to close</text>
    </Overlay>
  );
}
