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
  ["cmd+c / ctrl+shift+c", "Copy selected text to clipboard"],
  ["click PR #/URL", "Open pull request in browser"],
  ["?", "Toggle help"],
  ["q/esc", "Quit"],
];

export function HelpOverlay() {
  return (
    <Overlay title="Help" borderColor={tokens.border}>
      <box flexDirection="column" style={{ maxHeight: 40 }}>
        <scrollbox flexGrow={1}>
          {HELP_ENTRIES.map(([key, desc]) => (
            <text key={key}>
              <span fg={tokens.accent}>{key.padEnd(10)}</span>
              <span> - </span>
              <span>{desc}</span>
            </text>
          ))}
        </scrollbox>
      </box>
      <text style={{ marginTop: 1, fg: tokens.dim }}>Press any key to close</text>
    </Overlay>
  );
}
