import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "bun:test";

type HookSlot = {
  state?: unknown;
  deps?: readonly unknown[];
  value?: unknown;
  ref?: { current: unknown };
};

type MockPty = {
  close: () => void;
  resize: () => void;
  write: (data: Uint8Array) => void;
  invalidate: () => void;
};

type MockSpawnOptions = {
  terminal?: {
    data?: (terminal: MockPty, data: Uint8Array) => void;
    exit?: (terminal: MockPty, exitCode: number | null) => void;
  };
};

type MockProc = {
  terminal: MockPty;
  exited: Promise<number>;
  kill: () => void;
};

type BenchmarkResult = {
  switchMs: number;
  idleCpuPercent: number;
  droppedKeystrokes: number;
};

const SWITCH_TARGET_MS = 100;
const IDLE_SAMPLE_MS = 5_000;
const KEYSTROKE_COUNT = 1_000;

const hookState: HookSlot[] = [];
let hookIndex = 0;
const ptyDataHandlers = new Map<MockPty, (data: Uint8Array) => void>();

function depsEqual(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

mock.module("react", () => ({
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
  createContext<T>(defaultValue: T) {
    return { _defaultValue: defaultValue };
  },
  useContext<T>(ctx: { _defaultValue: T }) {
    return ctx._defaultValue;
  },
}));

mock.module("@opentui/react", () => ({
  useKeyboard() {},
  usePaste() {},
  useSelectionHandler() {},
  useTerminalDimensions() {
    return { width: 120, height: 40 };
  },
  useRenderer() {
    return {
      width: 120,
      terminalHeight: 40,
      forceFullRepaintRequested: false,
      clearSelection() {},
      getSelection() {
        return null;
      },
    };
  },
}));

function resetRenderCursor(): void {
  hookIndex = 0;
}

function installHeadlessPtySpawn(): void {
  Bun.spawn = ((_: string[], opts: MockSpawnOptions): MockProc => {
    const terminal: MockPty = {
      close() {},
      resize() {},
      write(data) {
        opts.terminal?.data?.(terminal, data);
      },
      invalidate() {},
    };
    if (opts.terminal?.data) {
      ptyDataHandlers.set(terminal, (data) => opts.terminal?.data?.(terminal, data));
    }
    return {
      terminal,
      exited: new Promise<number>(() => {}),
      kill() {},
    };
  }) as unknown as typeof Bun.spawn;
}

function cpuPercent(start: NodeJS.CpuUsage, end: NodeJS.CpuUsage, elapsedMs: number): number {
  const cpuMicros = end.user + end.system - start.user - start.system;
  const elapsedMicros = elapsedMs * 1_000;
  return (cpuMicros / elapsedMicros) * 100;
}

async function sampleIdleCpu(): Promise<number> {
  const startCpu = process.cpuUsage();
  const startTime = performance.now();
  await new Promise((resolve) => setTimeout(resolve, IDLE_SAMPLE_MS));
  return cpuPercent(startCpu, process.cpuUsage(), performance.now() - startTime);
}

async function main(): Promise<void> {
  installHeadlessPtySpawn();

  const { activateTerminalSession, updateRecentTerminalSessions } = await import("../src/tui/components/App.js");
  const { useTerminalSessions } = await import("../src/tui/hooks/useTerminalSessions.js");

  const worktreePath = join(tmpdir(), "wtx-session-benchmark");
  mkdirSync(worktreePath, { recursive: true });

  resetRenderCursor();
  let terminalSessions = useTerminalSessions();
  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const created = terminalSessions.createSession("bench", "session-switch", worktreePath, { cols: 80, rows: 24 }).session;
    if (!created) throw new Error("failed to create benchmark terminal session");
    sessions.push(created);
    resetRenderCursor();
    terminalSessions = useTerminalSessions();
  }

  const sessionsForWorktree = terminalSessions.getSessions("bench", "session-switch", worktreePath);
  const renderer = { forceFullRepaintRequested: false };

  let activeTabId = sessionsForWorktree[0]!.id;
  let recentSessionIds: string[] = [];
  const handleSelectTab = (id: string) => {
    const isSession = activateTerminalSession(sessionsForWorktree, activeTabId, id, renderer);
    recentSessionIds = updateRecentTerminalSessions(recentSessionIds, activeTabId, id, sessionsForWorktree.map((session) => session.id));
    activeTabId = id;
    return isSession;
  };

  const startSwitch = performance.now();
  handleSelectTab(sessionsForWorktree[1]!.id);
  const switchMs = performance.now() - startSwitch;

  const idleCpuPercent = await sampleIdleCpu();

  let receivedKeystrokes = 0;
  terminalSessions.registerListener(sessionsForWorktree[1]!.id, (data) => {
    receivedKeystrokes += data.length;
  });

  const noisySession = sessionsForWorktree[2]!;
  const noisyWriter = ptyDataHandlers.get(noisySession.terminal as unknown as MockPty);
  if (!noisyWriter) throw new Error("benchmark noisy session missing PTY data handler");

  for (let i = 0; i < KEYSTROKE_COUNT; i++) {
    noisyWriter(new TextEncoder().encode("y\n"));
    handleSelectTab(i % 2 === 0 ? sessionsForWorktree[0]!.id : sessionsForWorktree[2]!.id);
    terminalSessions.sendInput("bench", "session-switch", worktreePath, sessionsForWorktree[1]!.id, "x");
  }

  const droppedKeystrokes = KEYSTROKE_COUNT - receivedKeystrokes;
  const result: BenchmarkResult = {
    switchMs: Number(switchMs.toFixed(3)),
    idleCpuPercent: Number(idleCpuPercent.toFixed(3)),
    droppedKeystrokes,
  };

  if (result.switchMs >= SWITCH_TARGET_MS) {
    throw new Error(`session switch latency ${result.switchMs}ms exceeded ${SWITCH_TARGET_MS}ms target`);
  }
  if (result.droppedKeystrokes !== 0) {
    throw new Error(`session throughput dropped ${result.droppedKeystrokes} keystrokes`);
  }

  console.log(JSON.stringify(result, null, 2));
}

await main();
