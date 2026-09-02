import { Overlay } from "./Overlay.js";
import { useState } from "react";
import { tokens } from "../theme.js";

export interface InputModalProps {
  title: string;
  placeholder?: string;
  initialValue?: string;
  errorMessage?: string;
  onSubmit: (value: string) => void;
}

export function InputModal({ title, placeholder, initialValue, errorMessage, onSubmit }: InputModalProps) {
  const [value, setValue] = useState(initialValue ?? "");

  return (
    <Overlay title={title} borderColor={tokens.accent}>
      <box flexDirection="column" width="100%">
        <box flexGrow={1} width="100%">
          <input
            focused={true}
            value={value}
            placeholder={placeholder}
            onInput={(val: string) => setValue(val)}
            onSubmit={() => onSubmit(value)}
            width="100%"
          />
        </box>
        {errorMessage ? (
          <text fg={tokens.error} style={{ marginTop: 1 }}>
            {errorMessage}
          </text>
        ) : (
          <text fg={tokens.dim} style={{ marginTop: 1 }}>
            Press Enter to submit, empty to cancel
          </text>
        )}
      </box>
    </Overlay>
  );
}
