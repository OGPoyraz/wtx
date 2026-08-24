import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";

export function HelpOverlay() {
  return (
    <Overlay title="Help" borderColor={tokens.border}>
      <text><span fg={tokens.accent}>↑/↓, k/j</span><span> - Navigate list</span></text>
      <text><span fg={tokens.accent}>/</span><span> - Filter list</span></text>
      <text><span fg={tokens.accent}>Space</span><span> - Multi-select</span></text>
      <text><span fg={tokens.accent}>c</span><span> - Open configuration</span></text>
      <text><span fg={tokens.accent}>r</span><span> - Refresh data</span></text>
      <text><span fg={tokens.accent}>f</span><span> - Fetch main for selected repo</span></text>
      <text><span fg={tokens.accent}>n</span><span> - Create new worktree</span></text>
      <text><span fg={tokens.accent}>b</span><span> - Rebase selected onto main</span></text>
      <text><span fg={tokens.accent}>s</span><span> - Sync selected</span></text>
      <text><span fg={tokens.accent}>o</span><span> - Open selected in IDE</span></text>
      <text><span fg={tokens.accent}>a</span><span> - Spawn agent in selected</span></text>
      <text><span fg={tokens.accent}>d</span><span> - Remove selected worktree</span></text>
      <text><span fg={tokens.accent}>?</span><span> - Toggle help</span></text>
      <text><span fg={tokens.accent}>q/esc</span><span> - Quit</span></text>
      
      <text style={{ marginTop: 1, fg: tokens.dim }}>Press any key to close</text>
    </Overlay>
  );
}
