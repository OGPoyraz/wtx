import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChangesTabModel } from "../src/tui/components/ChangesTab.js";
import type { ChangeScope } from "../src/lib/changes.js";
import type { WorktreeRow } from "../src/tui/types.js";

type HookSlot = {
  state?: unknown;
  deps?: readonly unknown[];
  value?: unknown;
  ref?: { current: unknown };
  effect?: () => void | (() => void);
  cleanup?: void | (() => void);
};

type ChangedFileFixture = {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
};

type DiffFixture = {
  path: string;
  scope: ChangeScope;
  binary: boolean;
  diff: string;
  truncated: boolean;
};

type HookResult = ReturnType<typeof useChangesTabModel>;

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
          slot.cleanup = effect() ?? undefined;
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

  const mockRow: WorktreeRow = {
    repoName: "wtx",
    branch: "feat/foo",
    path: "/tmp/wtx/feat/foo",
    commitShort: "a1b2c3d",
    isMainCheckout: false,
    isLocked: false,
    isPrunable: false,
    isBare: false,
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
  let testRun = 0;

  beforeEach(() => {
    testRun += 1;
    reactMock.reset();
  });

  function renderHook(
    isActive: boolean,
    row: typeof mockRow | null,
    getChangedFilesImpl: (opts: { repoPath: string; branch: string; scope: string }) => Promise<ChangedFileFixture[]>,
    getFileDiffImpl: (opts: { repoPath: string; branch: string; scope: string; filePath: string }) => Promise<DiffFixture>,
    worktreeKey = row ? `${row.repoName}:${row.branch}:${row.path}:${testRun}` : "",
    getStackBaseImpl: (repoPath: string, branch: string) => Promise<string | null> = vi.fn().mockResolvedValue(null)
  ): HookResult {
    reactMock.beginRender();
    useChangesTabModel(isActive, row, worktreeKey, getChangedFilesImpl, getFileDiffImpl, getStackBaseImpl);
    reactMock.runEffects();
    reactMock.beginRender();
    const result = useChangesTabModel(isActive, row, worktreeKey, getChangedFilesImpl, getFileDiffImpl, getStackBaseImpl);
    return result;
  }

  async function flush() {
    await new Promise((r) => setTimeout(r, 0));
  }

  it("returns default empty state when not active or no row", () => {
    const api = renderHook(false, null, vi.fn(), vi.fn());
    expect(api.files).toBeNull();
    expect(api.loadingList).toBe(false);
    expect(api.diffs).toEqual({});
    expect(api.scope).toBe("worktree");
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
    await flush();
    
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
    await flush();
    
    const res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.loadingDiff).toBe(true);
    
    resolveDiff!(diff);
    await flush();
    
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

  it("cycles scopes in worktree staged base order and reloads the list", async () => {
    const getChangedFilesMock = vi.fn()
      .mockResolvedValueOnce([{ path: "worktree.ts", status: "M", added: 1, removed: 0, binary: false }])
      .mockResolvedValueOnce([{ path: "staged.ts", status: "A", added: 2, removed: 0, binary: false }])
      .mockResolvedValueOnce([{ path: "base.ts", status: "M", added: 3, removed: 1, binary: false }]);
    const getFileDiffMock = vi.fn().mockResolvedValue({ path: "worktree.ts", scope: "worktree", binary: false, diff: "diff", truncated: false });

    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    await flush();
    let res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.scope).toBe("worktree");

    res.cycleScope();
    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.scope).toBe("staged");
    expect(res.files).toBeNull();
    await flush();

    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.files?.[0]?.path).toBe("staged.ts");
    expect(getChangedFilesMock).toHaveBeenLastCalledWith({
      repoPath: mockRow.path,
      branch: mockRow.branch,
      scope: "staged",
    });

    res.cycleScope();
    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.scope).toBe("base");
    await flush();

    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.files?.[0]?.path).toBe("base.ts");

    res.cycleScope();
    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(res.scope).toBe("worktree");
  });

  it("labels base scope with the recorded stack base", async () => {
    const getChangedFilesMock = vi.fn().mockResolvedValue([]);
    const getStackBaseMock = vi.fn().mockResolvedValue("refs/heads/feat/api");

    let res = renderHook(true, mockRow, getChangedFilesMock, vi.fn(), undefined, getStackBaseMock);
    await flush();
    res = renderHook(true, mockRow, getChangedFilesMock, vi.fn(), undefined, getStackBaseMock);

    res.cycleScope();
    res = renderHook(true, mockRow, getChangedFilesMock, vi.fn(), undefined, getStackBaseMock);
    res.cycleScope();
    res = renderHook(true, mockRow, getChangedFilesMock, vi.fn(), undefined, getStackBaseMock);

    expect(res.scope).toBe("base");
    expect(res.scopeLabel).toBe("vs feat/api");
  });

  it("does not re-fetch when cycling back to a cached scope", async () => {
    const getChangedFilesMock = vi.fn()
      .mockResolvedValueOnce([{ path: "worktree.ts", status: "M", added: 1, removed: 0, binary: false }])
      .mockResolvedValueOnce([{ path: "staged.ts", status: "A", added: 2, removed: 0, binary: false }])
      .mockResolvedValueOnce([{ path: "base.ts", status: "M", added: 3, removed: 1, binary: false }]);
    const getFileDiffMock = vi.fn().mockResolvedValue({ path: "x", scope: "worktree", binary: false, diff: "diff", truncated: false });

    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    await flush();
    let res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);

    res.cycleScope();
    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    await flush();
    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);

    res.cycleScope();
    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    await flush();
    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);

    expect(getChangedFilesMock).toHaveBeenCalledTimes(3);

    res.cycleScope();
    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock);
    expect(getChangedFilesMock).toHaveBeenCalledTimes(3);
    expect(res.files?.[0]?.path).toBe("worktree.ts");
  });

  it("remembers scope per worktree for the session", async () => {
    const getChangedFilesMock = vi.fn().mockResolvedValue([]);
    const getFileDiffMock = vi.fn().mockResolvedValue({ path: "x", scope: "worktree", binary: false, diff: "diff", truncated: false });
    const otherRow = { ...mockRow, branch: "feat/bar", path: "/tmp/wtx/feat/bar" };

    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock, "wtx:feat/foo");
    await flush();
    let res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock, "wtx:feat/foo");
    res.cycleScope();
    renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock, "wtx:feat/foo");
    await flush();

    res = renderHook(true, otherRow, getChangedFilesMock, getFileDiffMock, "wtx:feat/bar");
    expect(res.scope).toBe("worktree");
    await flush();

    res = renderHook(true, mockRow, getChangedFilesMock, getFileDiffMock, "wtx:feat/foo");
    expect(res.scope).toBe("staged");
  });
});
