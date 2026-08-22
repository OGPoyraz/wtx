import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";

interface ConfirmModalProps {
  title: string;
  message: string;
}

export function ConfirmModal({ title, message }: ConfirmModalProps) {
  return (
    <Overlay title={title} borderColor={tokens.warning}>
      <box flexDirection="column" justifyContent="center" alignItems="center">
        <text>{message}</text>
        <text style={{ marginTop: 2 }}>
          <span fg={tokens.dim}>[y] </span><span>Yes   </span>
          <span fg={tokens.dim}>[n/esc] </span><span>Cancel</span>
        </text>
      </box>
    </Overlay>
  );
}
