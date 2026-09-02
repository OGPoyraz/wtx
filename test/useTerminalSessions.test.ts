import { describe, expect, it, vi } from "vitest";
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
    function Probe() {
      reactMock.beginRender();
      return useTerminalSessions();
    }

    const first = Probe();
    const second = Probe();

    expect(Object.is(first, second)).toBe(true);
  });
});
