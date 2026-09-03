
import "./env.js";
import { createCliRenderer, TextTableRenderable, EmbeddedTerminalRenderable } from "@opentui/core";
import { createRoot, extend } from "@opentui/react";
import type { GlobalOptions } from "../types.js";
import { App } from "./components/App.js";
import { setQuiet } from "../lib/log.js";

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "text-table": typeof TextTableRenderable;
    "embedded-terminal": typeof EmbeddedTerminalRenderable;
  }
}

declare module "@opentui/core" {
  interface EmbeddedTerminalOptions {
    focused?: boolean;
  }
}

extend({ "text-table": TextTableRenderable, "embedded-terminal": EmbeddedTerminalRenderable });

export interface TerminalRunOptions {
  withoutDetails?: boolean;
}

export async function runTerminal(opts: GlobalOptions, runOpts: TerminalRunOptions = {}): Promise<void> {
  setQuiet(true);
  const prevLog = console.log;
  const prevInfo = console.info;
  const prevWarn = console.warn;
  const prevError = console.error;
  const prevStdoutWrite = process.stdout.write.bind(process.stdout);
  const prevStderrWrite = process.stderr.write.bind(process.stderr);
  const shouldSuppress = (chunk: unknown) => {
    const s = typeof chunk === "string" ? chunk : chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : String(chunk);
    return s.includes("page_list") || s.includes("adjusting page") || s.includes("x icon") || s.includes("received and ignored");
  };
  const suppressed = (..._args: unknown[]) => {};
  const filteredError = (...args: unknown[]) => {
    if (args.some(shouldSuppress)) return;
    (prevError as (...a: unknown[]) => void)(...args);
  };
  console.log = suppressed as unknown as typeof console.log;
  console.info = suppressed as unknown as typeof console.info;
  console.warn = suppressed as unknown as typeof console.warn;
  console.error = filteredError as unknown as typeof console.error;
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (shouldSuppress(chunk as string)) return true;
    return (prevStdoutWrite as (...a: unknown[]) => boolean)(chunk as string, ...(rest as unknown[]));
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (shouldSuppress(chunk as string)) return true;
    return (prevStderrWrite as (...a: unknown[]) => boolean)(chunk as string, ...(rest as unknown[]));
  }) as typeof process.stderr.write;

  let nativeStderrSaved: number | null = null;
  let nativeLib: ReturnType<typeof import("bun:ffi").dlopen> | null = null;
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    nativeLib = dlopen("/usr/lib/libSystem.B.dylib", {
      dup: { args: [FFIType.i32], returns: FFIType.i32 },
      dup2: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      open: { args: [FFIType.cstring, FFIType.i32], returns: FFIType.i32 },
      close: { args: [FFIType.i32], returns: FFIType.i32 },
    }) as unknown as ReturnType<typeof dlopen>;
    const nullFd = (nativeLib.symbols.open as unknown as (p: string, f: number) => number)("/dev/null", 1);
    if (nullFd >= 0) {
      const saved = (nativeLib.symbols.dup as unknown as (fd: number) => number)(2);
      if (saved >= 0) {
        nativeStderrSaved = saved;
        (nativeLib.symbols.dup2 as unknown as (a: number, b: number) => number)(nullFd, 2);
      }
      (nativeLib.symbols.close as unknown as (fd: number) => number)(nullFd);
    }
  } catch {}

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    consoleMode: "disabled",
  });

  const restoreConsole = () => {
    console.log = prevLog;
    console.info = prevInfo;
    console.warn = prevWarn;
    console.error = prevError;
    process.stdout.write = prevStdoutWrite as typeof process.stdout.write;
    process.stderr.write = prevStderrWrite as typeof process.stderr.write;
    if (nativeStderrSaved !== null && nativeStderrSaved >= 0 && nativeLib) {
      try {
        (nativeLib.symbols.dup2 as unknown as (a: number, b: number) => number)(nativeStderrSaved, 2);
        (nativeLib.symbols.close as unknown as (fd: number) => number)(nativeStderrSaved);
      } catch {}
      nativeStderrSaved = null;
    }
    setQuiet(false);
  };

  const root = createRoot(renderer);

  try {
    root.render(<App opts={opts} withoutDetails={runOpts.withoutDetails ?? false} />);
  } catch (err) {
    restoreConsole();
    renderer.destroy();
    console.error("Failed to render TUI:", err);
    process.exit(1);
  }

  const originalDestroy = renderer.destroy.bind(renderer);
  renderer.destroy = (() => {
    restoreConsole();
    return originalDestroy();
  }) as typeof renderer.destroy;
}
