import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";

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

function ChoiceOptionRow<T extends string>({ option, index, isSelected, onSelect }: { option: ChoiceOption<T>; index: number; isSelected: boolean; onSelect: (v: T) => void }) {
  const tap = useTapHandler(() => onSelect(option.value));
  return (
    <box flexDirection="column" backgroundColor={isSelected ? tokens.selectionBg : undefined} {...tap}>
      <text>
        <span fg={isSelected ? tokens.bright : tokens.fg}>{`${index + 1}. ${option.label}`}</span>
      </text>
      {option.desc && <text fg={tokens.dim}>{`   ${option.desc}`}</text>}
    </box>
  );
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
          <ChoiceOptionRow key={option.value} option={option} index={i} isSelected={i === index} onSelect={onSubmit} />
        ))}
        <text fg={tokens.dim} style={{ marginTop: 1 }}>
          ↑/↓ to choose · Enter to confirm · 1-{options.length} quick pick · Esc to cancel · click to select
        </text>
      </box>
    </Overlay>
  );
}
