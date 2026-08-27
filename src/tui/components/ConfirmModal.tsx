import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  const yesTap = useTapHandler(() => onConfirm?.());
  const noTap = useTapHandler(() => onCancel?.());
  return (
    <Overlay title={title} borderColor={tokens.warning}>
      <box flexDirection="column" justifyContent="center" alignItems="center">
        <text>{message}</text>
        <box flexDirection="row" gap={2} style={{ marginTop: 2 }}>
          <box {...(onConfirm ? yesTap : {})}>
            <text>
              <span fg={tokens.dim}>[y] </span><span fg={tokens.success}>Yes</span>
            </text>
          </box>
          <box {...(onCancel ? noTap : {})}>
            <text>
              <span fg={tokens.dim}>[n/esc] </span><span>Cancel</span>
            </text>
          </box>
        </box>
      </box>
    </Overlay>
  );
}
