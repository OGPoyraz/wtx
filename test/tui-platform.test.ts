import { describe, it, expect } from "vitest";
import { clipboardCandidatesFor, browserCommandFor } from "../src/tui/platform.js";
import { terminalLink } from "../src/lib/log.js";
import { wrapText, isTapWithoutDrag } from "../src/tui/utils.js";

describe("clipboardCandidatesFor", () => {
  it("uses pbcopy on darwin", () => {
    expect(clipboardCandidatesFor("darwin")).toEqual([{ cmd: "pbcopy", args: [] }]);
  });

  it("uses clip on win32", () => {
    expect(clipboardCandidatesFor("win32")).toEqual([{ cmd: "clip", args: [] }]);
  });

  it("prefers wl-copy on wayland sessions", () => {
    const candidates = clipboardCandidatesFor("linux", { WAYLAND_DISPLAY: "wayland-0" });
    expect(candidates[0]).toEqual({ cmd: "wl-copy", args: [] });
  });

  it("offers xclip and xsel on X11 sessions", () => {
    const candidates = clipboardCandidatesFor("linux", { DISPLAY: ":0" });
    expect(candidates.map((c) => c.cmd)).toEqual(["xclip", "xsel"]);
  });

  it("returns nothing without a display server", () => {
    expect(clipboardCandidatesFor("linux", {})).toEqual([]);
  });
});

describe("browserCommandFor", () => {
  it("uses open on darwin for http(s) urls", () => {
    expect(browserCommandFor("darwin", "https://github.com/o/r/pull/1")).toEqual({
      cmd: "open",
      args: ["https://github.com/o/r/pull/1"],
    });
  });

  it("uses xdg-open on linux", () => {
    expect(browserCommandFor("linux", "http://example.com")).toEqual({
      cmd: "xdg-open",
      args: ["http://example.com"],
    });
  });

  it("routes through cmd start on win32", () => {
    const command = browserCommandFor("win32", "https://github.com/o/r/pull/1");
    expect(command?.cmd).toBe("cmd");
    expect(command?.args.slice(0, 3)).toEqual(["/c", "start", ""]);
  });

  it("rejects non-http urls", () => {
    expect(browserCommandFor("darwin", "file:///etc/passwd")).toBeNull();
    expect(browserCommandFor("darwin", "javascript:alert(1)")).toBeNull();
    expect(browserCommandFor("darwin", "not a url")).toBeNull();
  });
});

describe("terminalLink", () => {
  const ttyStream = { isTTY: true } as NodeJS.WriteStream;
  const pipeStream = { isTTY: false } as NodeJS.WriteStream;

  it("wraps the url in an OSC 8 hyperlink on ttys", () => {
    const url = "https://github.com/o/r/pull/42";
    expect(terminalLink(url, undefined, pipeStream)).toBe(url);
    expect(terminalLink(url, "#42", ttyStream)).toBe(
      `\x1b]8;;${url}\x1b\\#42\x1b]8;;\x1b\\`
    );
  });

  it("emits plain text off-tty so pipes stay clean", () => {
    const url = "https://github.com/o/r/pull/42";
    expect(terminalLink(url, undefined, pipeStream)).not.toContain("\x1b");
  });
});

describe("wrapText", () => {
  it("wraps words at the width boundary", () => {
    expect(wrapText("aaa bbb ccc ddd", 7)).toEqual(["aaa bbb", "ccc ddd"]);
  });

  it("keeps single long words intact", () => {
    expect(wrapText("supercalifragilistic", 5)).toEqual(["supercalifragilistic"]);
  });

  it("handles newlines and collapses runs of spaces", () => {
    expect(wrapText("a\n b   c", 10)).toEqual(["a", "b c"]);
  });
});

describe("isTapWithoutDrag", () => {
  it("accepts a press and release at the same spot", () => {
    expect(isTapWithoutDrag({ x: 10, y: 5 }, { x: 10, y: 5 })).toBe(true);
    expect(isTapWithoutDrag({ x: 10, y: 5 }, { x: 11, y: 6 })).toBe(true);
  });

  it("rejects a drag beyond one cell", () => {
    expect(isTapWithoutDrag({ x: 10, y: 5 }, { x: 14, y: 5 })).toBe(false);
    expect(isTapWithoutDrag({ x: 10, y: 5 }, { x: 10, y: 12 })).toBe(false);
  });
});
