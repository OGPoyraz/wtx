import { beforeEach, describe, it, expect, vi } from "vitest";
import { Semaphore } from "../src/lib/semaphore.js";
import type { Config, RepoContext } from "../src/types.js";
import type { ForgeAdapter, PrInfo } from "../src/lib/forge/types.js";
import type { Worktree } from "../src/lib/git.js";
import type { WorktreeRow } from "../src/tui/types.js";

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
    useEffect() {
      hookIndex++;
    },
  };
});

const dataMocks = vi.hoisted(() => ({
  loadConfig: vi.fn<() => Config>(),
  resolveRepos: vi.fn<(_: Config) => RepoContext[]>(),
  resolveMainBranch: vi.fn<(_: RepoContext, __: Config) => Promise<string>>(),
  getWorktreeList: vi.fn<(_: string) => Promise<Worktree[]>>(),
  getDirtyFiles: vi.fn<(_: string) => Promise<string[]>>(),
  detectInProgressRebase: vi.fn<(_: string) => string | null>(),
  gitExec: vi.fn<(_: string[], __?: { cwd?: string; verbose?: boolean; dryRun?: boolean }) => Promise<string>>(),
  resolveCommitSha: vi.fn<(_: string, __: string) => Promise<string>>(),
  resolveForge: vi.fn<(_: RepoContext) => ForgeAdapter | null>(),
  detectDepsState: vi.fn<(_: string, __: string) => { strategy: string }>(),
  resolveOwnership: vi.fn<() => Promise<null>>(),
  readStackMetadata: vi.fn<() => Promise<{ version: 1; branches: Record<string, never> }>>(),
}));

vi.mock("react", () => ({
  useState: reactMock.useState,
  useRef: reactMock.useRef,
  useCallback: reactMock.useCallback,
  useEffect: reactMock.useEffect,
}));

vi.mock("../src/lib/config.js", () => ({ loadConfig: dataMocks.loadConfig }));
vi.mock("../src/lib/resolver.js", () => ({
  resolveRepos: dataMocks.resolveRepos,
  resolveMainBranch: dataMocks.resolveMainBranch,
}));
vi.mock("../src/lib/git.js", () => ({
  getWorktreeList: dataMocks.getWorktreeList,
  getDirtyFiles: dataMocks.getDirtyFiles,
  detectInProgressRebase: dataMocks.detectInProgressRebase,
  gitExec: dataMocks.gitExec,
  resolveCommitSha: dataMocks.resolveCommitSha,
}));
vi.mock("../src/lib/forge/index.js", () => ({ resolveForge: dataMocks.resolveForge }));
vi.mock("../src/lib/deps.js", () => ({ detectDepsState: dataMocks.detectDepsState }));
vi.mock("../src/lib/owner.js", () => ({ resolveOwnership: dataMocks.resolveOwnership }));
vi.mock("../src/lib/stack.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/stack.js")>()),
  readStackMetadata: dataMocks.readStackMetadata,
}));

const { fetchWorktreeData } = await import("../src/tui/data.js");
const { useWorktrees } = await import("../src/tui/hooks/useWorktrees.js");

function repoConfig() {
  return {
    main_branch: "main",
    fetch_main_on_create: true,
    sync_files: [],
    post_create: [],
    post_sync: [],
    install_script: null,
    check_prs: true,
    forge_provider: "github",
    pr_lookup_repo: null,
    deps: { manager: "auto", strategy: "auto" },
  } as const;
}

function configFor(repoName: string): Config {
  return {
    version: 2,
    root: "/tmp",
    postfix: "-wt",
    ide: "cursor",
    default_main_branch: "main",
    user: null,
    repos: { [repoName]: repoConfig() },
    favorites: [],
    workspace_root: null,
    ports: { min: 4100, max: 4999 },
    tui: {
      leftPaneWidthWeight: 3,
      rightPaneWidthWeight: 7,
      theme: "tokyonight",
      custom_theme: null,
    },
  };
}

function repo(name: string): RepoContext {
  return {
    name,
    mainPath: `/tmp/${name}`,
    wtRoot: `/tmp/${name}-wt`,
    config: repoConfig(),
  };
}

function worktree(path: string, branch: string): Worktree {
  return {
    path,
    branch,
    commit: "abcdef123456",
    isLocked: false,
    isPrunable: false,
    isBare: false,
  };
}

function pr(overrides: Partial<PrInfo> = {}): PrInfo {
  return {
    number: 42,
    authorLogin: null,
    title: "feat",
    url: "https://github.com/owner/repo/pull/42",
    state: "open",
    isDraft: false,
    mergeable: "clean",
    checks: { total: 2, passed: 1, failed: 0, pending: 1 },
    reviewDecision: null,
    baseRefName: "main",
    unresolvedThreads: 0,
    updatedAt: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

function adapter(findForBranches: ForgeAdapter["findForBranches"]): ForgeAdapter {
  return {
    id: "github",
    findForBranches,
    fetchPrHead: async () => ({
      number: 1,
      title: "unused",
      url: "https://github.com/owner/repo/pull/1",
      state: "open",
      isDraft: false,
      headRefName: "unused",
      isCrossRepository: false,
      headOwnerLogin: null,
      headRepoName: null,
    }),
    buildHeadFetch: () => ({ url: null, refspec: "" }),
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

function setupRepo(repoName: string, rows: Worktree[]): RepoContext {
  const repoCtx = repo(repoName);
  dataMocks.loadConfig.mockReturnValue(configFor(repoName));
  dataMocks.resolveRepos.mockReturnValue([repoCtx]);
  dataMocks.resolveMainBranch.mockResolvedValue("main");
  dataMocks.getWorktreeList.mockResolvedValue(rows);
  dataMocks.getDirtyFiles.mockResolvedValue([]);
  dataMocks.detectInProgressRebase.mockReturnValue(null);
  dataMocks.gitExec.mockResolvedValue("0 1");
  dataMocks.resolveCommitSha.mockResolvedValue("abcdef123456");
  dataMocks.detectDepsState.mockReturnValue({ strategy: "none" });
  dataMocks.resolveOwnership.mockResolvedValue(null);
  dataMocks.readStackMetadata.mockResolvedValue({ version: 1, branches: {} });
  return repoCtx;
}

beforeEach(() => {
  vi.clearAllMocks();
  reactMock.reset();
});

describe("TUI Data pure helpers", () => {
  it("Semaphore restricts concurrency", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxActive = 0;

    const task = async (delay: number) => {
      await sem.acquire();
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, delay));
      active--;
      sem.release();
    };

    await Promise.all([
      task(10), task(10), task(10), task(10)
    ]);

    expect(maxActive).toBe(2);
    expect(active).toBe(0);
  });
});

describe("fetchWorktreeData PR streaming", () => {
  it("returns worktree rows before delayed PR lookup settles", async () => {
    setupRepo("fast-repo", [
      worktree("/tmp/fast-repo", "main"),
      worktree("/tmp/fast-repo-wt/feature", "feature"),
    ]);
    const prLookup = deferred<Map<string, PrInfo>>();
    const findForBranches = vi.fn<ForgeAdapter["findForBranches"]>(() => prLookup.promise);
    dataMocks.resolveForge.mockReturnValue(adapter(findForBranches));

    const data = await fetchWorktreeData({ verbose: false, dryRun: false });

    const feature = data.rows.find(row => row.branch === "feature");
    expect(feature?.prState).toBe("FETCHING");
    expect(feature?.prNumber).toBeNull();
    expect(findForBranches).not.toHaveBeenCalled();

    const updates: Array<{ repoName: string; rows: WorktreeRow[] }> = [];
    const stream = data.streamPrData(update => updates.push(update));
    expect(findForBranches).toHaveBeenCalledTimes(1);

    prLookup.resolve(new Map([["feature", pr({ number: 77 })]]));
    await stream;

    expect(updates).toHaveLength(1);
    expect(updates[0]!.rows.find(row => row.branch === "feature")?.prNumber).toBe(77);
    expect(updates[0]!.rows.find(row => row.branch === "feature")?.prState).toBe("CI_RUNNING");
  });

  it("falls back to cached PRs when refresh PR lookup fails", async () => {
    setupRepo("cache-repo", [
      worktree("/tmp/cache-repo", "main"),
      worktree("/tmp/cache-repo-wt/feature", "feature"),
    ]);
    dataMocks.resolveForge.mockReturnValue(adapter(async () => new Map([["feature", pr({ number: 88 })]])));
    const first = await fetchWorktreeData({ verbose: false, dryRun: false });
    await first.streamPrData(() => {});

    dataMocks.resolveForge.mockReturnValue(adapter(async () => {
      throw new Error("gh unavailable");
    }));
    const second = await fetchWorktreeData({ verbose: false, dryRun: false });
    const updates: Array<{ rows: WorktreeRow[]; warnings: { message: string }[] }> = [];
    await second.streamPrData(update => updates.push(update));

    expect(updates).toHaveLength(1);
    expect(updates[0]!.warnings[0]!.message).toContain("gh unavailable");
    expect(updates[0]!.rows.find(row => row.branch === "feature")?.prNumber).toBe(88);
    expect(updates[0]!.rows.find(row => row.branch === "feature")?.prState).toBe("CI_RUNNING");
  });
});

describe("useWorktrees PR streaming", () => {
  it("discards stale PR updates from a superseded refresh", async () => {
    setupRepo("stale-repo", []);
    const firstLookup = deferred<Map<string, PrInfo>>();
    let worktreeCall = 0;

    dataMocks.getWorktreeList.mockImplementation(async () => {
      worktreeCall++;
      const branch = worktreeCall === 1 ? "old" : "new";
      return [
        worktree("/tmp/stale-repo", "main"),
        worktree(`/tmp/stale-repo-wt/${branch}`, branch),
      ];
    });
    dataMocks.resolveForge.mockReturnValue(adapter(async ({ branches }) => {
      const branch = branches.find(br => br !== "main")!;
      if (branch === "old") return firstLookup.promise;
      return new Map([[branch, pr({ number: 2 })]]);
    }));

    function Probe() {
      reactMock.beginRender();
      return useWorktrees({ verbose: false, dryRun: false });
    }

    let hook = Probe();
    await hook.refresh();
    hook = Probe();
    expect(hook.blocks[0]?.rows.some(row => row.branch === "old")).toBe(true);

    await hook.refresh();
    await flushPromises();
    hook = Probe();
    expect(hook.blocks[0]?.rows.find(row => row.branch === "new")?.prNumber).toBe(2);

    firstLookup.resolve(new Map([["old", pr({ number: 1 })]]));
    await flushPromises();
    hook = Probe();

    expect(hook.blocks[0]?.rows.some(row => row.branch === "old")).toBe(false);
    expect(hook.blocks[0]?.rows.find(row => row.branch === "new")?.prNumber).toBe(2);
  });
});
