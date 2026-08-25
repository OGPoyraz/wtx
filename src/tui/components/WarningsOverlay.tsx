import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";
import type { DataWarning } from "../data.js";
import { wrapText } from "../utils.js";

export function WarningsOverlay({ warnings }: { warnings: DataWarning[] }) {
  return (
    <Overlay title={`Warnings (${warnings.length})`} borderColor={tokens.warning}>
      <box flexDirection="column" style={{ maxHeight: 30 }}>
        <scrollbox flexGrow={1}>
          {warnings.map((warning, i) => (
            <box key={i} flexDirection="column" style={{ marginBottom: 1 }}>
              <text fg={tokens.warning}>{`⚠ ${warning.repoName}`}</text>
              {wrapText(warning.message, 56).map((line, j) => (
                <text key={j} fg={tokens.fg}>{`  ${line}`}</text>
              ))}
            </box>
          ))}
        </scrollbox>
      </box>
      <text style={{ marginTop: 1, fg: tokens.dim }}>Press any key to close</text>
    </Overlay>
  );
}
