import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pasteCandidatesFor } from "../src/tui/platform.js";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("terminal paste hotfix behavior", () => {
  it("handles bracketed PasteEvent bytes through usePaste only when a terminal is focused", () => {
    const app = source("src/tui/components/App.tsx");

    expect(app).toContain("usePaste((event) => {");
    expect(app).toContain("if (!terminalFocused) return;");
    expect(app).toContain("const activeSession = sessionsForSelected.find((s) => s.id === activeTabId);");
    expect(app).toContain("event.preventDefault();");
    expect(app).toContain("const data = event.bytes;");
    expect(app).toContain("terminalSessions.sendInput(activeSession.repoName, activeSession.branch, activeSession.worktreePath, activeSession.id, data);");
  });

  it("selects the documented clipboard command fallback path for Super/Meta/Ctrl+V", () => {
    expect(pasteCandidatesFor("darwin")).toEqual([{ cmd: "pbpaste", args: [] }]);
    expect(pasteCandidatesFor("linux", { WAYLAND_DISPLAY: "wayland-1" })[0]).toEqual({ cmd: "wl-paste", args: ["--no-newline"] });
    expect(pasteCandidatesFor("linux", { DISPLAY: ":0" })).toEqual([
      { cmd: "xclip", args: ["-selection", "clipboard", "-o"] },
      { cmd: "xsel", args: ["--clipboard", "--output"] },
      { cmd: "wl-paste", args: ["--no-newline"] },
      { cmd: "xclip", args: ["-selection", "clipboard", "-o"] },
      { cmd: "xsel", args: ["--clipboard", "--output"] },
    ]);

    const app = source("src/tui/components/App.tsx");
    expect(app).toContain("readTextFromClipboard().then((text) =>");
    expect(app).toContain("(key.ctrl || (key as unknown as { super?: boolean }).super || (key as unknown as { meta?: boolean }).meta) && key.name === \"v\"");
    expect(app).toContain("if (text) terminalSessions.sendInput(activeSession.repoName, activeSession.branch, activeSession.worktreePath, activeSession.id, text);");
  });
});

describe("terminal rendering hotfix behavior", () => {
  it("invalidates the embedded terminal on listener registration and resize", () => {
    const terminalView = source("src/tui/components/TerminalView.tsx");

    expect(terminalView).toContain("registerListener(session.id, write);");
    expect(terminalView).toContain("termRef.current?.invalidate?.();");
    expect(terminalView).toContain("}, [session.cols, session.rows, session.usePty]);");
  });

  it("does not clear the embedded terminal destructively when sessions mount or switch", () => {
    const terminalView = source("src/tui/components/TerminalView.tsx");

    expect(terminalView).not.toContain("\\x1b[2J\\x1b[H");
    expect(terminalView).toContain("termRef.current?.write(data);");
    expect(terminalView).toContain("return () => unregisterListener(session.id);");
  });
});

describe("terminal scroll hotfix behavior", () => {
  it("keeps a 10000-line PTY scrollback budget", () => {
    const terminalView = source("src/tui/components/TerminalView.tsx");

    expect(terminalView).toContain("maxScrollback={10000}");
  });

  it("routes Shift+wheel to outer scroll while plain wheel is forwarded to the app", () => {
    const terminalView = source("src/tui/components/TerminalView.tsx");

    expect(terminalView).toContain("const orig = term.forwardMouse?.bind(term);");
    expect(terminalView).toContain("const shouldScrollOuter = shift === true;");
    expect(terminalView).toContain("if (!shouldScrollOuter) {");
    expect(terminalView).toContain("return orig(event as never, action);");
    expect(terminalView).toContain("term.lib.embeddedTerminalScroll(term.handle, dir === \"up\" ? -12 : 12);");
    expect(terminalView).toContain("ev.preventDefault?.();");
    expect(terminalView).toContain("ev.stopPropagation?.();");
  });
});

describe("terminal log suppression hotfix behavior", () => {
  it("sets native log environment variables to fatal defaults", () => {
    const env = source("src/tui/env.ts");

    expect(env).toContain("process.env.RUST_LOG ??= \"fatal\";");
    expect(env).toContain("process.env.ZIG_LOG ??= \"fatal\";");
    expect(env).toContain("process.env.PAGE_LIST_LOG ??= \"fatal\";");
    expect(env).toContain("process.env.OPENTUI_LOG ??= \"fatal\";");
    expect(env).toContain("process.env.LOG_LEVEL ??= \"fatal\";");
    expect(env).toContain("process.env.ZIG_LOG_LEVEL ??= \"fatal\";");
    expect(env).toContain("process.env.OPENTUI_LOG_LEVEL ??= \"fatal\";");
    expect(env).toContain("process.env.BUN_DEBUG ??= \"0\";");

    const index = source("src/tui/index.tsx");
    expect(index).toContain('import "./env.js";');
  });

  it("starts the TUI renderer with consoleMode disabled", () => {
    const index = source("src/tui/index.tsx");

    expect(index).toContain("const renderer = await createCliRenderer({");
    expect(index).toContain("exitOnCtrlC: false,");
    expect(index).toContain('consoleMode: "disabled",');
  });

  it("filters page_list PTY noise to a reset sequence before listeners see it", () => {
    const sessions = source("src/tui/hooks/useTerminalSessions.ts");

    expect(sessions).toContain("text.includes(\"page_list\") || text.includes(\"x icon\") || text.includes(\"received and ignored\")");
    expect(sessions).toContain(`const reset = new TextEncoder().encode("\\x1b[0m");`);
    expect(sessions).toContain("if (listener) listener(reset);");
    expect(sessions).toContain("return;");
  });
});
