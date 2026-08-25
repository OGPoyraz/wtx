import type { CliRenderer } from "@opentui/core";

export interface PlatformCommand {
  cmd: string;
  args: string[];
}

export function clipboardCandidatesFor(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env
): PlatformCommand[] {
  if (platform === "darwin") return [{ cmd: "pbcopy", args: [] }];
  if (platform === "win32") return [{ cmd: "clip", args: [] }];
  const candidates: PlatformCommand[] = [];
  if (env.WAYLAND_DISPLAY) candidates.push({ cmd: "wl-copy", args: [] });
  if (env.DISPLAY) {
    candidates.push({ cmd: "xclip", args: ["-selection", "clipboard"] });
    candidates.push({ cmd: "xsel", args: ["--clipboard", "--input"] });
  }
  return candidates;
}

export async function copyTextToClipboard(renderer: CliRenderer, text: string): Promise<boolean> {
  if (!text) return false;

  // OSC 52 reaches the terminal over SSH too; system commands cover
  // terminals that ignore OSC 52 (Terminal.app, iTerm2 defaults).
  const viaTerminal = renderer.copyToClipboardOSC52(text);

  let viaSystem = false;
  for (const candidate of clipboardCandidatesFor(process.platform)) {
    try {
      const proc = Bun.spawn([candidate.cmd, ...candidate.args], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      });
      proc.stdin.write(text);
      proc.stdin.end();
      if ((await proc.exited) === 0) {
        viaSystem = true;
        break;
      }
    } catch {
      // candidate binary not installed — try the next one
    }
  }

  return viaSystem || viaTerminal;
}

export function browserCommandFor(platform: NodeJS.Platform, url: string): PlatformCommand | null {
  if (!/^https?:\/\//.test(url)) return null;
  if (platform === "darwin") return { cmd: "open", args: [url] };
  if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url] };
  return { cmd: "xdg-open", args: [url] };
}

export async function openInBrowser(url: string): Promise<boolean> {
  const command = browserCommandFor(process.platform, url);
  if (!command) return false;
  try {
    const proc = Bun.spawn([command.cmd, ...command.args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}
