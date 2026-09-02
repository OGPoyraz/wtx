import { RGBA } from "@opentui/core";
import type { TextChunk } from "@opentui/core";
import { createContext, useContext } from "react";

export interface ThemeTokens {
  fg: string;
  bright: string;
  dim: string;
  border: string;
  borderActive: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  selectionBg: string;
  panelBg: string;
  scrim: string;
}

export const tokens: ThemeTokens = {
  fg: "#a9b1d6",
  bright: "#c0caf5",
  dim: "#565f89",
  border: "#3b4261",
  borderActive: "#565f89",
  accent: "#7aa2f7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
  selectionBg: "#33467c",
  panelBg: "#24283b",
  scrim: "#1a1b2699",
};

export const ThemeContext = createContext<ThemeTokens>(tokens);

export function useTheme(): ThemeTokens {
  try {
    const ctx = useContext(ThemeContext);
    return ctx ?? tokens;
  } catch {
    return tokens;
  }
}

export function chunk(text: string, opts?: { fg?: string; bg?: string; attributes?: number }): TextChunk {
  const c: TextChunk = { __isChunk: true, text };
  if (opts?.fg) {
    c.fg = RGBA.fromHex(opts.fg);
  }
  if (opts?.bg) {
    c.bg = RGBA.fromHex(opts.bg);
  }
  if (opts?.attributes !== undefined) {
    c.attributes = opts.attributes;
  }
  return c;
}

export function truncateBranch(name: string, max = 42): string {
  if (name.length <= max) return name;
  const charsForContext = max - 1;
  const suffixLen = Math.max(12, Math.floor(charsForContext * 0.3));
  const prefixLen = charsForContext - suffixLen;

  if (prefixLen < 12) {
    return name.slice(0, charsForContext) + "…";
  }

  return name.slice(0, prefixLen) + "…" + name.slice(name.length - suffixLen);
}
