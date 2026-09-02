import { useState, useCallback, useRef, useEffect, useMemo } from "react";

export interface TerminalSession {
  id: string;
  label: string;
  worktreeKey: string;
  worktreePath: string;
  repoName: string;
  branch: string;
  lines: string[];
  inputBuffer: string;
  exited: number | null;
  proc: any | null;
  terminal: any | null;
  cols: number;
  rows: number;
  usePty: boolean;
  spawnError: string | null;
}

export const MAX_TERMINAL_SESSIONS = 5;

export function worktreeKeyFor(repoName: string, branch: string, path: string): string {
  return path || `${repoName}:${branch}`;
}

export function nextTerminalSessionLabel(existingCount: number): string {
  return `Session ${existingCount + 1}`;
}

function isSameSize(session: TerminalSession, cols: number, rows: number): boolean {
  return session.cols === cols && session.rows === rows;
}

function updateSessionSize(session: TerminalSession, cols: number, rows: number): TerminalSession {
  return isSameSize(session, cols, rows) ? session : { ...session, cols, rows };
}

export function relabelTerminalSessions(sessions: TerminalSession[]): TerminalSession[] {
  return sessions.map((session, index) => ({ ...session, label: nextTerminalSessionLabel(index) }));
}

export function useTerminalSessions() {
  const [sessionsByKey, setSessionsByKey] = useState<Map<string, TerminalSession[]>>(() => new Map());
  const procsRef = useRef<Map<string, any>>(new Map());
  const listenersRef = useRef<Map<string, (data: Uint8Array) => void>>(new Map());

  const getSessions = useCallback(
    (repoName: string, branch: string, path: string): TerminalSession[] => {
      const key = worktreeKeyFor(repoName, branch, path);
      return sessionsByKey.get(key) ?? [];
    },
    [sessionsByKey]
  );

  const getKey = useCallback((repoName: string, branch: string, path: string) => worktreeKeyFor(repoName, branch, path), []);

  const createSession = useCallback(
    (
      repoName: string,
      branch: string,
      path: string,
      opts?: { cols?: number; rows?: number }
    ): { session: TerminalSession | null; error?: string } => {
      const key = worktreeKeyFor(repoName, branch, path);
      const existing = sessionsByKey.get(key) ?? [];
      if (existing.length >= MAX_TERMINAL_SESSIONS) {
        return { session: null, error: `Max ${MAX_TERMINAL_SESSIONS} sessions per worktree` };
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const label = nextTerminalSessionLabel(existing.length);
      const cols = opts?.cols ?? 80;
      const rows = opts?.rows ?? 24;
      const session: TerminalSession = {
        id,
        label,
        worktreeKey: key,
        worktreePath: path,
        repoName,
        branch,
        lines: [],
        inputBuffer: "",
        exited: null,
        proc: null,
        terminal: null,
        cols,
        rows,
        usePty: false,
        spawnError: null,
      };

      const shell = process.env.SHELL || "/bin/bash";

      const appendPipe = (data: Uint8Array<ArrayBufferLike>) => {
        const text = new TextDecoder().decode(data);
        const parts = text.split("\n");
        setSessionsByKey((prev) => {
          const next = new Map(prev);
          const list = next.get(key);
          if (!list) return prev;
          const idx = list.findIndex((s) => s.id === id);
          if (idx === -1) return prev;
          const updated = [...list];
          const sess = updated[idx]!;
          const newLines = [...sess.lines];
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i]!;
            if (i === 0 && newLines.length > 0) {
              if (part) newLines[newLines.length - 1] = (newLines[newLines.length - 1] ?? "") + part;
            } else {
              if (part || i < parts.length - 1) newLines.push(part);
            }
          }
          if (newLines.length > 1000) newLines.splice(0, newLines.length - 1000);
          updated[idx] = { ...sess, lines: newLines };
          next.set(key, updated);
          return next;
        });
      };

      const onPtyData = (data: Uint8Array) => {
        if (data.length > 0) {
          const text = new TextDecoder().decode(data);
          if (text.includes("page_list") || text.includes("x icon") || text.includes("received and ignored")) {
            const reset = new TextEncoder().encode("\x1b[0m");
            const listener = listenersRef.current.get(id);
            if (listener) listener(reset);
            return;
          }
        }
        const listener = listenersRef.current.get(id);
        if (listener) {
          listener(data);
          return;
        }
      };

      const onExit = (code: number | null) => {
        setSessionsByKey((prev) => {
          const next = new Map(prev);
          const list = next.get(key);
          if (!list) return prev;
          const idx = list.findIndex((s) => s.id === id);
          if (idx === -1) return prev;
          const updated = [...list];
          updated[idx] = { ...updated[idx]!, exited: code ?? 0, proc: null, terminal: null };
          next.set(key, updated);
          return next;
        });
        procsRef.current.delete(id);
        listenersRef.current.delete(id);
      };

      try {
        if (typeof Bun === "undefined" || typeof Bun.spawn !== "function") {
          throw new Error("pty not available");
        }
        const proc = Bun.spawn([shell], {
          cwd: path || process.cwd(),
          env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", WTX_SESSION: label },
          terminal: {
            cols,
            rows,
            name: "xterm-256color",
            data(_terminal: unknown, data: Uint8Array<ArrayBuffer>) {
              onPtyData(data);
            },
            exit(_terminal: unknown, exitCode: number, signal: string | null) {
              onExit(signal ? exitCode : exitCode);
            },
          },
        });
        if (!proc?.terminal) {
          throw new Error("pty not available");
        }
        session.proc = proc;
        session.terminal = proc.terminal;
        session.usePty = true;
        session.spawnError = null;
        procsRef.current.set(id, proc);
        (async () => {
          try {
            const code = await proc.exited;
            onExit(code);
          } catch {}
        })();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        session.spawnError = `Failed to spawn ${shell}: ${message}`;
        session.lines = [session.spawnError];
        session.usePty = false;
        try {
          const proc: any = Bun.spawn([shell], {
            cwd: path || process.cwd(),
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env, TERM: "xterm-256color", WTX_SESSION: label },
          });
          session.proc = proc;
          session.usePty = false;
          procsRef.current.set(id, proc);
          (async () => {
            const stdout = proc.stdout as ReadableStream<Uint8Array<ArrayBufferLike>> | undefined;
            if (stdout) {
              const reader = stdout.getReader();
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  if (value) appendPipe(value);
                }
              } catch {}
            }
          })();
          (async () => {
            const stderr = proc.stderr as ReadableStream<Uint8Array<ArrayBufferLike>> | undefined;
            if (stderr) {
              const reader = stderr.getReader();
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  if (value) appendPipe(value);
                }
              } catch {}
            }
          })();
          (async () => {
            try {
              const code = await proc.exited;
              onExit(code);
            } catch {}
          })();
        } catch {}
      }

      if (session.usePty) {
        session.lines = [`${label} — ${path} (${shell}) [pty]`, ""];
      } else if (!session.spawnError && session.lines.length === 0) {
        session.lines = [`${label} — ${path} (${shell})`, ""];
      }

      setSessionsByKey((prev) => {
        const next = new Map(prev);
        const list = next.get(key) ?? [];
        next.set(key, [...list, session]);
        return next;
      });

      return { session };
    },
    [sessionsByKey]
  );

  const removeSession = useCallback((repoName: string, branch: string, path: string, id: string) => {
    const key = worktreeKeyFor(repoName, branch, path);
    setSessionsByKey((prev) => {
      const next = new Map(prev);
      const list = next.get(key);
      if (!list) return prev;
      const sess = list.find((s) => s.id === id);
      if (sess?.proc) {
        try {
          if (sess.terminal) {
            try { sess.terminal.close(); } catch {}
          }
          sess.proc.kill();
        } catch {}
        procsRef.current.delete(id);
        listenersRef.current.delete(id);
      }
      const filtered = list.filter((s) => s.id !== id);
      const relabeled = relabelTerminalSessions(filtered);
      if (relabeled.length === 0) {
        next.delete(key);
      } else {
        next.set(key, relabeled);
      }
      return next;
    });
  }, []);

  const sendInput = useCallback(
    (repoName: string, branch: string, path: string, id: string, data: string | Uint8Array) => {
      const key = worktreeKeyFor(repoName, branch, path);
      const list = sessionsByKey.get(key) ?? [];
      const sess = list.find((s) => s.id === id);
      if (!sess?.proc) return;
      try {
        if (sess.usePty && sess.terminal) {
          if (typeof data === "string") {
            sess.terminal.write(new TextEncoder().encode(data));
          } else {
            sess.terminal.write(data);
          }
          return;
        }
        const proc = sess.proc as any;
        const str = typeof data === "string" ? data : new TextDecoder().decode(data as Uint8Array);
        if (proc.stdin && typeof proc.stdin.write === "function") {
          proc.stdin.write(str);
        } else if (proc.stdin instanceof WritableStream) {
          const writer = (proc.stdin as WritableStream<Uint8Array>).getWriter();
          writer.write(new TextEncoder().encode(str));
          writer.releaseLock();
        } else {
          proc.stdin?.write?.(str);
        }
      } catch {}
      if (!sess.usePty) {
        const str = typeof data === "string" ? data : new TextDecoder().decode(data);
        if (str.endsWith("\n")) {
          const cmd = str.slice(0, -1);
          if (cmd) {
            setSessionsByKey((prev) => {
              const next = new Map(prev);
              const l = next.get(key);
              if (!l) return prev;
              const idx = l.findIndex((s) => s.id === id);
              if (idx === -1) return prev;
              const updated = [...l];
              const s = updated[idx]!;
              updated[idx] = { ...s, lines: [...s.lines, `$ ${cmd}`] };
              next.set(key, updated);
              return next;
            });
          }
        }
      }
    },
    [sessionsByKey]
  );

  const resizeSession = useCallback(
    (repoName: string, branch: string, path: string, id: string, cols: number, rows: number) => {
      const key = worktreeKeyFor(repoName, branch, path);
      setSessionsByKey((prev) => {
        const list = prev.get(key);
        if (!list) return prev;
        const idx = list.findIndex((s) => s.id === id);
        if (idx === -1) return prev;
        const sess = list[idx]!;
        if (isSameSize(sess, cols, rows)) return prev;
        try {
          sess.terminal?.resize?.(cols, rows);
        } catch {}
        const next = new Map(prev);
        const updated = [...list];
        updated[idx] = updateSessionSize(sess, cols, rows);
        next.set(key, updated);
        return next;
      });
    },
    []
  );

  const registerListener = useCallback((id: string, fn: (data: Uint8Array) => void) => {
    listenersRef.current.set(id, fn);
  }, []);

  const unregisterListener = useCallback((id: string) => {
    listenersRef.current.delete(id);
  }, []);

  const cleanupAll = useCallback(() => {
    for (const proc of procsRef.current.values()) {
      try {
        if (proc.terminal) { try { proc.terminal.close(); } catch {} }
        proc.kill();
      } catch {}
    }
    procsRef.current.clear();
    listenersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => cleanupAll();
  }, [cleanupAll]);

  const pruneKey = useCallback((key: string) => {
    setSessionsByKey((prev) => {
      const next = new Map(prev);
      const list = next.get(key);
      if (!list) return prev;
      for (const s of list) {
        if (s.proc) {
          try {
            if (s.terminal) { try { s.terminal.close(); } catch {} }
            s.proc.kill();
          } catch {}
          procsRef.current.delete(s.id);
          listenersRef.current.delete(s.id);
        }
      }
      next.delete(key);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      sessionsByKey,
      getSessions,
      getKey,
      createSession,
      removeSession,
      sendInput,
      resizeSession,
      registerListener,
      unregisterListener,
      pruneKey,
      cleanupAll,
    }),
    [
      sessionsByKey,
      getSessions,
      getKey,
      createSession,
      removeSession,
      sendInput,
      resizeSession,
      registerListener,
      unregisterListener,
      pruneKey,
      cleanupAll,
    ]
  );
}
