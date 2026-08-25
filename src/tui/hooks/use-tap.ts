import { useRef, useCallback } from "react";
import type { MouseEvent } from "@opentui/core";
import { isTapWithoutDrag } from "../utils.js";

export function useTapHandler(onTap: () => void) {
  const down = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback((e: MouseEvent) => {
    down.current = { x: e.x, y: e.y };
  }, []);

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const start = down.current;
      down.current = null;
      if (!start || !isTapWithoutDrag(start, e)) return;
      onTap();
    },
    [onTap]
  );

  return { onMouseDown, onMouseUp };
}
