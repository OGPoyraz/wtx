import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChangesTabModel } from "../src/tui/components/ChangesTab.js";

type HookSlot = {
  state?: unknown;
  deps?: readonly unknown[];
  value?: unknown;
  ref?: { current: unknown };
  effect?: () => void | (() => void);
  cleanup?: void | (() => void);
};

const reactMock = vi.hoisted(() => {
  const hookState: HookSlot[] = [];
  let hookIndex = 0;
  let effectQueue: Array<() => void> = [];

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
      effectQueue = [];
    },
    runEffects() {
      const queue = effectQueue;
      effectQueue = [];
      for (const fn of queue) fn();
    },
    reset() {
      hookState.length = 0;
      hookIndex = 0;
      effectQueue = [];
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
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const slot = hookState[hookIndex] ?? (hookState[hookIndex] = {});
      if (!depsEqual(slot.deps, deps)) {
        slot.deps = deps;
        slot.effect = effect;
        effectQueue.push(() => {
          if (slot.cleanup && typeof slot.cleanup === "function") {
            slot.cleanup();
          }
          slot.cleanup = effect() as any;
        });
      }
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
  createContext: vi.fn(() => ({})),
  useContext: vi.fn(),
}));

const mockRow = {
  repoName: "wtx",
  branch: "feat/foo",
  path: "/tmp/wtx/feat/foo",
  commitShort: "a1b2c3d",
  isMainCheckout: false,
  isLocked: false,
  isPrunable: false,
  dirtyFiles: [],
  ahead: 0,
  behind: 0,
  prNumber: null,
  prState: null,
  prChecks: null,
  prUrl: null,
  owner: null,
  isPendingCreate: false,
  rebaseStatus: null,
  depsStrategy: "auto",
};

describe("ChangesTab hooks", () => {
  beforeEach(() => {
    reactMock.reset();
  });

  function renderHook(isActive: boolean, row: any, getChangedFilesImpl: any, getFileDiffImpl: any) {
    reactMock.beginRender();
    useChangesTabModel(isActive, row, getChangedFilesImpl, getFileDiffImpl);
    reactMock.runEffects();
    reactMock.beginRender();
    const result = useChangesTabModel(isActive, row, getChangedFilesImpl, getFileDiffImpl);
    return result;
  }

  it("returns default empty state when not active or no row", () => {
    const api = renderHook(false, null, vi.fn(), vi.fn());
    expect(api.files).toBeNull();
    expect(api.loadingList).toBe(false);
    expect(api.diffs).toEqual({});
  });

  it("loads files on activate", async () => {
    const files = [
      { path: "src/index.ts", status: "M", added: 2, removed: 1, binary: false }
    ];
    let resolveFiles: (f: any) => void;
    const getChangedFilesMock = vi.fn().mockImplementation(() => new Promise(r => resolveFiles = r));
    
    const first = renderHook(true, mockRow, getChangedFilesMock, vi.fn());
    expect(first.loadingList).toBe(true);
    expect(first.files).toBeNull();
    
    resolveFiles!(files);
    await new Promise((r) => setTimeout(r, 0));
    
    const second = renderHook(true, mockRow, getChangedFilesMock, vi.fn().mockResolvedValue({}));
    
    expect(second.loadingList).toBe(false);
    expect(second.files).toEqual(files);
    expect(second.selectedIndex).toBe(0);
    expect(second.selectedFile).toEqual(files[0]);
  });

  it("loads diff when file is selected", async () => {
    const files = [
      { path: "src/index.ts", status: "M", added: 2, removed: 1, binary: false }
    ];
    const getChangedFilesMock = vi.fn().mockResolvedValue(files);
    const diff = { path: "src/index.ts", scope: "worktree", binary: false, diff: "diff content", truncated: false };
    
    let resolveDiff: (f: any) => void;
    const getFileDiffMock = vi.fn().mockImplementation(() => new Promise(r => resolveDiff = r));
    
    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    await new Promise((r) => setTimeout(r, 0));
    
    const res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.loadingDiff).toBe(true);
    
    resolveDiff!(diff);
    await new Promise((r) => setTimeout(r, 0));
    
    const res2 = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    
    expect(res2.loadingDiff).toBe(false);
    expect(res2.diffs["src/index.ts"]).toEqual(diff);
    expect(getFileDiffMock).toHaveBeenCalledWith({
      repoPath: "/tmp/wtx/feat/foo",
      branch: "feat/foo",
      scope: "worktree",
      filePath: "src/index.ts"
    });
  });

  it("handles errors gracefully", async () => {
    const getChangedFilesMock = vi.fn().mockRejectedValue(new Error("Git error"));
    
    renderHook(true, mockRow, getChangedFilesMock, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    
    const res = renderHook(true, mockRow, getChangedFilesMock, vi.fn());
    
    expect(res.loadingList).toBe(false);
    expect(res.listError).toContain("Git error");
    expect(res.files).toBeNull();
  });
});