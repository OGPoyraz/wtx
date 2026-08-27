import { useRef, useCallback } from "react";
import type { MouseEvent } from "@opentui/core";
import { isTapWithoutDrag } from "../utils.js";

export function useTapHandler(onTap: (e: MouseEvent) => void) {
  const down = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    down.current = { x: e.x, y: e.y };
  }, []);

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const start = down.current;
      down.current = null;
      if (e.button !== 0) return;
      if (!start || !isTapWithoutDrag(start, e)) return;
      e.stopPropagation();
      onTap(e);
    },
    [onTap]
  );

  return { onMouseDown, onMouseUp };
}
