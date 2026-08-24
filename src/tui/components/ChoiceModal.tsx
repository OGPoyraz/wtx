import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  desc?: string;
}

export interface ChoiceModalProps<T extends string = string> {
  title: string;
  options: ChoiceOption<T>[];
  initialIndex?: number;
  onSubmit: (value: T) => void;
  onCancel: () => void;
}

export function ChoiceModal<T extends string = string>({ title, options, initialIndex = 0, onSubmit, onCancel }: ChoiceModalProps<T>) {
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), options.length - 1));

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel();
      return;
    }
    if (key.name === "up" || key.name === "k") {
      setIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.name === "down" || key.name === "j") {
      setIndex(prev => Math.min(options.length - 1, prev + 1));
      return;
    }
    if (key.name === "return") {
      const option = options[index];
      if (option) onSubmit(option.value);
      return;
    }
    const num = parseInt(key.name, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= options.length) {
      const option = options[num - 1];
      if (option) onSubmit(option.value);
    }
  });

  return (
    <Overlay title={title} borderColor={tokens.accent}>
      <box flexDirection="column">
        {options.map((option, i) => (
          <box key={option.value} flexDirection="column" backgroundColor={i === index ? tokens.selectionBg : undefined}>
            <text>
              <span fg={i === index ? tokens.bright : tokens.fg}>{`${i + 1}. ${option.label}`}</span>
            </text>
            {option.desc && (
              <text fg={tokens.dim}>{`   ${option.desc}`}</text>
            )}
          </box>
        ))}
        <text fg={tokens.dim} style={{ marginTop: 1 }}>
          ↑/↓ to choose · Enter to confirm · 1-{options.length} quick pick · Esc to cancel
        </text>
      </box>
    </Overlay>
  );
}
