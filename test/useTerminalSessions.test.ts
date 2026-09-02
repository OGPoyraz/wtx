import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TERMINAL_SESSIONS, nextTerminalSessionLabel, relabelTerminalSessions, useTerminalSessions, worktreeKeyFor, type TerminalSession } from "../src/tui/hooks/useTerminalSessions.js";

type HookSlot = {
  state?: unknown;
  deps?: readonly unknown[];
  value?: unknown;
  ref?: { current: unknown };
};

const reactMock = vi.hoisted(() => {
  const hookState: HookSlot[] = [];
  let hookIndex = 0;

  function depsEqual(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  return {
    beginRender() {
      hookIndex = 0;
    },
    reset() {
      hookState.length = 0;
      hookIndex = 0;
    },
    useState<T>(initialState: T | (() => T)) {
      const slot = hookState[hookIndex] ?? (hookState[hookIndex] = {});
      if (!Object.prototype.hasOwnProperty.call(slot, "state")) {
        slot.state = typeof initialState === "function" ? (initialState as () => T)() : initialState;
      }
      const currentIndex = hookIndex++;
      return [
        slot.state as T,
        (next: T | ((prev: T) => T)) => {
          const prev = hookState[currentIndex]!.state as T;
          hookState[currentIndex]!.state = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        },
      ] as const;
    },
    useRef<T>(initialValue: T) {
      const slot = hookState[hookIndex] ?? (hookState[hookIndex] = {});
      if (!slot.ref) {
        slot.ref = { current: initialValue };
      }
      hookIndex++;
      return slot.ref as { current: T };
    },
    useCallback<T>(fn: T, deps: readonly unknown[]) {
      const slot = hookState[hookIndex] ?? (hookState[hookIndex] = {});
      if (!depsEqual(slot.deps, deps)) {
        slot.deps = deps;
        slot.value = fn;
      }
      hookIndex++;
      return slot.value as T;
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]) {
      const slot = hookState[hookIndex] ?? (hookState[hookIndex] = {});
      if (!depsEqual(slot.deps, deps)) {
        slot.deps = deps;
        slot.value = factory();
      }
      hookIndex++;
      return slot.value as T;
    },
    useEffect() {
      hookIndex++;
    },
  };
});

vi.mock("react", () => ({
  useState: reactMock.useState,
  useRef: reactMock.useRef,
  useCallback: reactMock.useCallback,
  useMemo: reactMock.useMemo,
  useEffect: reactMock.useEffect,
}));

type MockPty = {
  close: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
};

type MockSpawnOptions = {
  terminal?: {
    data?: (terminal: MockPty, data: Uint8Array) => void;
  };
};

type MockBun = {
  spawn: ReturnType<typeof vi.fn<(_: string[], opts: MockSpawnOptions) => { terminal: MockPty; exited: Promise<number>; kill: ReturnType<typeof vi.fn> }>>;
};

const originalBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");

function Probe() {
  reactMock.beginRender();
  return useTerminalSessions();
}

function installPtySpawnMock() {
  const terminal: MockPty = {
    close: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
  };
  const proc = {
    terminal,
    exited: new Promise<number>(() => {}),
    kill: vi.fn(),
  };
  let onData: ((data: Uint8Array) => void) | null = null;
  const spawn: MockBun["spawn"] = vi.fn((_, opts) => {
    onData = opts.terminal?.data ? (data: Uint8Array) => opts.terminal?.data?.(terminal, data) : null;
    return proc;
  });

  Object.defineProperty(globalThis, "Bun", {
    configurable: true,
    value: { spawn },
  });

  return {
    proc,
    terminal,
    writePty(data: Uint8Array) {
      onData?.(data);
    },
  };
}

function installPtySpawnFailureMock(error: Error) {
  const spawn = vi.fn(() => {
    throw error;
  });

  Object.defineProperty(globalThis, "Bun", {
    configurable: true,
    value: { spawn },
  });
}

function restoreBun() {
  if (originalBun) {
    Object.defineProperty(globalThis, "Bun", originalBun);
  } else {
    Reflect.deleteProperty(globalThis, "Bun");
  }
}

beforeEach(() => {
  reactMock.reset();
});

afterEach(() => {
  restoreBun();
});

function session(id: string, label: string): TerminalSession {
  return {
    id,
    label,
    worktreeKey: "repo:branch",
    worktreePath: "/tmp/repo/branch",
    repoName: "repo",
    branch: "branch",
    lines: [],
    inputBuffer: "",
    exited: null,
    proc: null,
    terminal: null,
    cols: 80,
    rows: 24,
    usePty: false,
    spawnError: null,
  };
}

describe("useTerminalSessions helpers", () => {
  it("builds stable worktree keys", () => {
    expect(worktreeKeyFor("repo", "branch", "/tmp/path")).toBe("/tmp/path");
    expect(worktreeKeyFor("repo", "branch", "")).toBe("repo:branch");
  });

  it("labels sessions sequentially", () => {
    expect(nextTerminalSessionLabel(0)).toBe("Session 1");
    expect(nextTerminalSessionLabel(4)).toBe("Session 5");
  });

  it("relabels sessions after removal", () => {
    const relabeled = relabelTerminalSessions([session("1", "Session 1"), session("3", "Session 3")]);
    expect(relabeled.map((s) => s.label)).toEqual(["Session 1", "Session 2"]);
  });

  it("keeps the documented cap constant", () => {
    expect(MAX_TERMINAL_SESSIONS).toBe(5);
  });

  it("keeps the returned API reference stable across no-op session re-renders", () => {
    const first = Probe();
    const second = Probe();

    expect(Object.is(first, second)).toBe(true);
  });

  it("does not replay buffered PTY chunks when a listener re-registers", () => {
    const pty = installPtySpawnMock();
    const api = Probe();
    const created = api.createSession("repo", "branch", "/tmp/repo/branch").session;
    expect(created?.usePty).toBe(true);
    if (!created) throw new Error("expected session");

    const firstWrite = vi.fn();
    api.registerListener(created.id, firstWrite);
    const chunks = Array.from({ length: 100 }, (_, index) => new TextEncoder().encode(`chunk-${index}\n`));
    for (const chunk of chunks) pty.writePty(chunk);
    expect(firstWrite).toHaveBeenCalledTimes(100);

    api.unregisterListener(created.id);
    const secondWrite = vi.fn();
    api.registerListener(created.id, secondWrite);

    expect(secondWrite).toHaveBeenCalledTimes(0);
  });

  it("keeps the PTY terminal instance across a simulated tab switch", () => {
    const pty = installPtySpawnMock();
    const api = Probe();
    const created = api.createSession("repo", "branch", "/tmp/repo/branch").session;
    if (!created) throw new Error("expected session");

    const terminalWrite = vi.fn();
    api.registerListener(created.id, terminalWrite);
    pty.writePty(new TextEncoder().encode("visible scrollback\n"));
    api.unregisterListener(created.id);
    api.registerListener(created.id, terminalWrite);

    const rerendered = Probe();
    const [sessionAfterSwitch] = rerendered.getSessions("repo", "branch", "/tmp/repo/branch");

    expect(sessionAfterSwitch?.terminal).toBe(pty.terminal);
    expect(sessionAfterSwitch?.usePty).toBe(true);
    expect(terminalWrite).toHaveBeenCalledTimes(1);
  });

  it("surfaces PTY spawn failures as readable session state", () => {
    installPtySpawnFailureMock(new Error("ENOENT"));
    const api = Probe();
    const created = api.createSession("repo", "branch", "/tmp/repo/branch").session;
    if (!created) throw new Error("expected session");

    const shell = process.env.SHELL || "/bin/bash";

    expect(created.spawnError).toBe(`Failed to spawn ${shell}: ENOENT`);
    expect(created.lines[0]).toBe(`Failed to spawn ${shell}: ENOENT`);
    expect(created.usePty).toBe(false);
  });
});
