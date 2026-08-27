import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";

const HELP_ENTRIES: [string, string][] = [
  ["↑/↓, k/j", "Navigate list"],
  ["/", "Filter list"],
  ["Space", "Multi-select"],
  ["c", "Open configuration"],
  ["n", "Create new worktree (pick dependency strategy)"],
  ["f", "Fetch main for selected repo(s)"],
  ["p", "Pull latest changes for selected branch(es)"],
  ["P (shift+p)", "Pull PR by link (force-override if exists)"],
  ["b", "Rebase selected onto base (or main)"],
  ["s", "Sync selected (env files + hooks)"],
  ["i", "Install dependencies in selection (worktrees and main)"],
  ["m", "Rename selected worktree (branch + directory)"],
  ["o", "Open selected in IDE"],
  ["a", "Spawn agent in selected"],
  ["d", "Remove selected worktree(s)"],
  ["e", "View data warnings (when count > 0)"],
  ["r", "Refresh data"],
  ["H", "Action history"],
  ["mouse drag", "Select text — copied to clipboard automatically"],
  ["ctrl+shift+c", "Copy selection again (terminals reserve cmd+c)"],
  ["click PR #/URL", "Open pull request in browser"],
  ["?", "Toggle help"],
  ["q/esc", "Quit"],
];

export function HelpOverlay() {
  return (
    <Overlay title="Help" borderColor={tokens.border} width={84}>
      <box flexDirection="column" style={{ maxHeight: 36 }}>
        <scrollbox flexGrow={1}>
          {HELP_ENTRIES.map(([key, desc]) => (
            <box key={key} flexDirection="row" gap={1}>
              <box width={18} flexShrink={0} justifyContent="flex-end">
                <text fg={tokens.accent}>{key}</text>
              </box>
              <text fg={tokens.dim}>-</text>
              <box flexGrow={1}>
                <text fg={tokens.fg}>{desc}</text>
              </box>
            </box>
          ))}
        </scrollbox>
      </box>
      <text style={{ marginTop: 1, fg: tokens.dim }}>Press any key to close</text>
    </Overlay>
  );
}
