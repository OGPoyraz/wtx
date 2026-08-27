import { useState, useRef, useCallback } from "react";
import type { MouseEvent } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { tokens } from "../theme.js";
import { clampSplitRatio } from "../utils.js";

interface DividerProps {
  splitRatio: number;
  totalWidth: number;
  onChange: (ratio: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

export function Divider({ splitRatio, totalWidth, onChange, onDraggingChange }: DividerProps) {
  const renderer = useRenderer();
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startRatioRef = useRef<number>(splitRatio);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      startXRef.current = e.x;
      startRatioRef.current = splitRatio;
      setDragging(true);
      onDraggingChange?.(true);
      renderer.clearSelection();
      e.stopPropagation();
    },
    [splitRatio, onDraggingChange, renderer]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      startXRef.current = null;
      setDragging(false);
      onDraggingChange?.(false);
      e.stopPropagation();
    },
    [onDraggingChange]
  );

  const handleMouseDrag = useCallback(
    (e: MouseEvent) => {
      if (startXRef.current === null) return;
      renderer.clearSelection();
      const dx = e.x - startXRef.current;
      const next = clampSplitRatio(totalWidth, startRatioRef.current + dx / totalWidth);
      onChange(next);
      e.stopPropagation();
    },
    [totalWidth, onChange, renderer]
  );

  const dragHandlers = {
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
    onMouseDrag: handleMouseDrag,
    onMouseMove: handleMouseDrag,
  };

  return (
    <box
      width={3}
      height="100%"
      backgroundColor={dragging ? tokens.selectionBg : hovered ? tokens.panelBg : undefined}
      {...dragHandlers}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      alignItems="center"
      justifyContent="center"
    >
      <text
        fg={dragging ? tokens.accent : hovered ? tokens.borderActive : tokens.border}
        {...dragHandlers}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        {" │ "}
      </text>
    </box>
  );
}
