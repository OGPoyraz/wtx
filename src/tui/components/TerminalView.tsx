import { useState, useEffect, useRef, useCallback } from "react";
import type { EmbeddedTerminalRenderable, ScrollBoxRenderable } from "@opentui/core";
import { tokens } from "../theme.js";
import type { TerminalSession } from "../hooks/useTerminalSessions.js";
import { useTapHandler } from "../hooks/use-tap.js";

interface TerminalViewProps {
  session: TerminalSession;
  focused: boolean;
  onFocus: () => void;
  onSend: (data: string | Uint8Array) => void;
  onResize?: (cols: number, rows: number) => void;
  registerListener?: (id: string, fn: (data: Uint8Array) => void) => void;
  unregisterListener?: (id: string) => void;
}

export function TerminalView({ session, focused, onFocus, onSend, onResize, registerListener, unregisterListener }: TerminalViewProps) {
  const [draft, setDraft] = useState("");
  const focusTap = useTapHandler(() => onFocus());
  const termRef = useRef<EmbeddedTerminalRenderable | null>(null);
  const pipeScrollRef = useRef<ScrollBoxRenderable | null>(null);

  const handlePtyScroll = useCallback((e: unknown) => {
    const ev = e as { scroll?: { direction?: string }; preventDefault?: () => void; stopPropagation?: () => void };
    const dir = ev.scroll?.direction;
    if (dir !== "up" && dir !== "down") return;
    const term = termRef.current as unknown as { handle?: unknown; lib?: { embeddedTerminalScroll: (h: unknown, d: number) => void }; requestRender?: () => void } | null;
    if (term?.handle && term?.lib) {
      try {
        term.lib.embeddedTerminalScroll(term.handle, dir === "up" ? -8 : 8);
        term.requestRender?.();
        ev.preventDefault?.();
        ev.stopPropagation?.();
      } catch {}
    }
  }, []);

  const handlePipeScroll = useCallback((e: unknown) => {
    const ev = e as { scroll?: { direction?: string }; preventDefault?: () => void; stopPropagation?: () => void };
    const dir = ev.scroll?.direction;
    if (dir !== "up" && dir !== "down") return;
    try {
      pipeScrollRef.current?.scrollBy(dir === "up" ? -4 : 4);
      ev.preventDefault?.();
      ev.stopPropagation?.();
    } catch {}
  }, []);

  const handleData = useCallback(
    (data: Uint8Array, source: string) => {
      if (source !== "input") return;
      if (session.usePty && focused) return;
      onSend(data);
    },
    [onSend, focused, session.id, session.usePty]
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      onResize?.(cols, rows);
    },
    [onResize]
  );

  useEffect(() => {
    if (!session.usePty || !session.terminal) return;
    if (!termRef.current || !registerListener || !unregisterListener) return;
    const write = (data: Uint8Array) => {
      try {
        termRef.current?.write(data);
      } catch {}
    };
    registerListener(session.id, write);
    try {
      termRef.current?.invalidate?.();
    } catch {}
    return () => unregisterListener(session.id);
  }, [session.id, session.usePty, session.terminal, registerListener, unregisterListener]);

  useEffect(() => {
    if (!session.usePty) return;
    if (!termRef.current) return;
    try {
      if (focused) termRef.current.focus?.();
      else termRef.current.blur?.();
    } catch {}
  }, [focused, session.usePty]);

  useEffect(() => {
    if (!session.usePty || !session.terminal) return;
    if (!termRef.current) return;
    try {
      termRef.current.invalidate?.();
    } catch {}
  }, [session.cols, session.rows, session.usePty]);

  useEffect(() => {
    if (!session.usePty || !termRef.current) return;
    const term = termRef.current as unknown as {
      handle?: unknown;
      lib?: { embeddedTerminalScroll: (h: unknown, d: number) => void };
      requestRender?: () => void;
      forwardMouse?: (e: unknown, a: string) => void;
    };
    const orig = term.forwardMouse?.bind(term);
    if (!orig) return;
    const patched = (event: unknown, action: string) => {
      const ev = event as { type?: string; scroll?: { direction?: string }; preventDefault?: () => void; stopPropagation?: () => void; modifiers?: { shift?: boolean } };
      if (ev.type === "scroll") {
        const dir = ev.scroll?.direction;
        const shift = (ev as unknown as { modifiers?: { shift?: boolean } }).modifiers?.shift;
        if (dir === "up" || dir === "down") {
          const shouldScrollOuter = shift === true;
          if (!shouldScrollOuter) {
            return orig(event as never, action);
          }
          try {
            if (term.handle && term.lib) {
              term.lib.embeddedTerminalScroll(term.handle, dir === "up" ? -12 : 12);
              term.requestRender?.();
            }
            ev.preventDefault?.();
            ev.stopPropagation?.();
            return;
          } catch {}
        }
      }
      return orig(event as never, action);
    };
    term.forwardMouse = patched as unknown as typeof term.forwardMouse;
    return () => {
      term.forwardMouse = orig as unknown as typeof term.forwardMouse;
    };
  }, [session.id, session.usePty, session.terminal]);

  if (session.usePty && session.terminal) {
    return (
      <box flexDirection="column" flexGrow={1} width="100%" height="100%" {...focusTap} onMouseScroll={handlePtyScroll}>
        <box flexGrow={1} width="100%" height="100%" flexDirection="column" padding={1} onMouseScroll={handlePtyScroll}>
          <embedded-terminal
            ref={termRef}
            width="100%"
            height="100%"
            cols={session.cols}
            rows={session.rows}
            maxScrollback={10000}
            onData={handleData}
            onTerminalResize={handleResize}
            selectable={true}
            focused={focused}
          />
        </box>
        {session.exited !== null && <text fg={tokens.warning}>— exited with code {session.exited} — press t for new session</text>}
        {!focused && <text fg={tokens.dim}>Click to focus · Ctrl+G or click table to unfocus · {session.label} PTY · scroll wheel to view history</text>}
        {focused && <text fg={tokens.accent}>Focused PTY — all keys go to shell · Ctrl+G to unfocus · scroll wheel to view history</text>}
      </box>
    );
  }

  const lines = session.lines;

  return (
    <box flexDirection="column" flexGrow={1} width="100%" height="100%" {...focusTap} onMouseScroll={handlePipeScroll}>
      <scrollbox ref={pipeScrollRef} flexGrow={1} width="100%" border={false} focused={false} stickyScroll={false} style={{ marginBottom: 1 }} onMouseScroll={handlePipeScroll}>
        {lines.length === 0 ? (
          <text fg={tokens.dim}>No output yet — type a command below.</text>
        ) : (
          lines.slice(-500).map((line, idx) => (
            <text key={idx} fg={session.exited !== null ? tokens.dim : tokens.fg}>
              {line || " "}
            </text>
          ))
        )}
        {session.exited !== null && <text fg={tokens.warning}>— exited with code {session.exited} —</text>}
      </scrollbox>
      <box flexDirection="row" gap={1} width="100%">
        <text fg={tokens.dim}>$</text>
        <box flexGrow={1}>
          <input
            focused={focused}
            value={draft}
            placeholder={focused ? "Type command, Enter to send, Esc to unfocus" : "Click to focus terminal"}
            onInput={(v: string) => setDraft(v)}
            onSubmit={() => {
              if (!draft) return;
              onSend(draft + "\n");
              setDraft("");
            }}
          />
        </box>
      </box>
      {!focused && <text fg={tokens.dim}>Click terminal or press 't' to focus · Ctrl+G or click table to unfocus</text>}
      {focused && <text fg={tokens.accent}>Focused — typing goes to shell · Ctrl+G to unfocus · max 5 per worktree persist across switches</text>}
    </box>
  );
}
