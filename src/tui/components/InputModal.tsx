import { Overlay } from "./Overlay.js";
import { useState } from "react";
import { tokens } from "../theme.js";

export interface InputModalProps {
  title: string;
  placeholder?: string;
  errorMessage?: string;
  onSubmit: (value: string) => void;
}

export function InputModal({ title, placeholder, errorMessage, onSubmit }: InputModalProps) {
  const [value, setValue] = useState("");

  return (
    <Overlay title={title} borderColor={tokens.accent}>
      <box flexDirection="column">
        <input
          focused={true}
          placeholder={placeholder}
          onInput={(val: string) => setValue(val)}
          onSubmit={() => onSubmit(value)}
        />
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
