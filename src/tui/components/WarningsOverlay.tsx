import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";
import type { DataWarning } from "../data.js";
import { wrapText } from "../utils.js";
import { useTapHandler } from "../hooks/use-tap.js";

export function WarningsOverlay({ warnings, onAcknowledge, onClose }: { warnings: DataWarning[]; onAcknowledge?: () => void; onClose?: () => void }) {
  const ackTap = useTapHandler(() => onAcknowledge?.());
  const closeTap = useTapHandler(() => onClose?.());
  return (
    <Overlay title={`Warnings (${warnings.length})`} borderColor={tokens.warning} width={80}>
      <box flexDirection="column" style={{ maxHeight: 28 }}>
        <scrollbox flexGrow={1}>
          {warnings.map((warning, i) => (
            <box key={i} flexDirection="column" style={{ marginBottom: 1 }}>
              <text fg={tokens.warning}>{`⚠ ${warning.repoName}`}</text>
              {wrapText(warning.message, 72).map((line, j) => (
                <text key={j} fg={tokens.fg}>{`  ${line}`}</text>
              ))}
            </box>
          ))}
        </scrollbox>
      </box>
      <box flexDirection="row" gap={3} style={{ marginTop: 2 }} justifyContent="center">
        <box {...ackTap}>
          <text>
            <span fg={tokens.dim}>[a] </span>
            <span fg={tokens.success}>Acknowledge</span>
          </text>
        </box>
        <box {...closeTap}>
          <text>
            <span fg={tokens.dim}>[esc] </span>
            <span>Close</span>
          </text>
        </box>
      </box>
      <text style={{ marginTop: 1, fg: tokens.dim }}>Press a to acknowledge and clear errors</text>
    </Overlay>
  );
}
