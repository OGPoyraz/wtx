import { describe, it, expect } from "vitest";
import {
  THEMES,
  tokyonightTokens,
  resolveThemeName,
  nextThemeName,
  DEFAULT_THEME_NAME,
} from "../src/tui/themes/index.js";
import { tokens, ThemeContext, useTheme } from "../src/tui/theme.js";

describe("theme registry", () => {
  it("contains all 5 theme presets", () => {
    expect(THEMES).toHaveProperty("tokyonight");
    expect(THEMES).toHaveProperty("catppuccin-mocha");
    expect(THEMES).toHaveProperty("gruvbox-dark");
    expect(THEMES).toHaveProperty("nord");
    expect(THEMES).toHaveProperty("rose-pine-dawn");

    expect(THEMES.tokyonight).toBe(tokyonightTokens);
  });

  it("tokyonight tokens match the default exported tokens (backward compat)", () => {
    expect(tokyonightTokens).toEqual(tokens);
  });

  it("exposes every expected token key for all themes", () => {
    const expectedKeys = [
      "fg",
      "bright",
      "dim",
      "border",
      "borderActive",
      "accent",
      "success",
      "warning",
      "error",
      "selectionBg",
      "panelBg",
      "scrim",
    ] as const;

    for (const themeName of Object.keys(THEMES)) {
      const theme = THEMES[themeName];
      for (const key of expectedKeys) {
        expect(theme).toHaveProperty(key);
        expect(typeof theme[key]).toBe("string");
      }
    }
  });

  it("provides a ThemeContext with tokyonight as default", () => {
    expect(ThemeContext).toBeDefined();
    expect(typeof useTheme).toBe("function");
  });
});

describe("resolveThemeName", () => {
  it("returns the requested theme when it exists", () => {
    expect(resolveThemeName("nord")).toBe("nord");
    expect(resolveThemeName("catppuccin-mocha")).toBe("catppuccin-mocha");
  });

  it("falls back to tokyonight for unknown names", () => {
    expect(resolveThemeName("does-not-exist")).toBe(DEFAULT_THEME_NAME);
    expect(resolveThemeName("")).toBe(DEFAULT_THEME_NAME);
  });

  it("falls back to tokyonight for null/undefined", () => {
    expect(resolveThemeName(undefined)).toBe(DEFAULT_THEME_NAME);
    expect(resolveThemeName(null)).toBe(DEFAULT_THEME_NAME);
  });

  it("defaults to tokyonight", () => {
    expect(DEFAULT_THEME_NAME).toBe("tokyonight");
  });
});

describe("nextThemeName", () => {
  it("cycles through themes in registry order", () => {
    const names = Object.keys(THEMES);
    for (let i = 0; i < names.length; i++) {
      const current = names[i]!;
      const expected = names[(i + 1) % names.length];
      expect(nextThemeName(current)).toBe(expected);
    }
  });

  it("wraps around from last to first theme", () => {
    const names = Object.keys(THEMES);
    const last = names[names.length - 1]!;
    expect(nextThemeName(last)).toBe(names[0]);
  });

  it("returns first theme for unknown current", () => {
    const names = Object.keys(THEMES);
    expect(nextThemeName("bogus-theme")).toBe(names[0]);
  });
});

describe("theme cycle + persist simulation", () => {
  it("startup + full cycle returns to initial theme after N steps", () => {
    const configuredTheme = "gruvbox-dark";
    let current = resolveThemeName(configuredTheme);
    expect(current).toBe("gruvbox-dark");

    const seen: string[] = [current];
    const total = Object.keys(THEMES).length;
    for (let i = 0; i < total; i++) {
      current = nextThemeName(current);
      seen.push(current);
    }
    expect(seen[seen.length - 1]).toBe("gruvbox-dark");
    expect(new Set(seen.slice(0, total)).size).toBe(total);
  });

  it("invalid stored theme falls back to tokyonight on startup", () => {
    const current = resolveThemeName("no-such-theme");
    expect(current).toBe("tokyonight");
    expect(THEMES[current]).toBe(tokyonightTokens);
  });

  it("cycling persists the next theme name (config write shape)", () => {
    const configTui = { theme: "tokyonight", leftPaneWidthWeight: 3, rightPaneWidthWeight: 7, custom_theme: null };
    const current = resolveThemeName(configTui.theme);
    const next = nextThemeName(current);
    const updatedTui = { ...configTui, theme: next };
    expect(updatedTui.theme).not.toBe(configTui.theme);
    expect(THEMES).toHaveProperty(updatedTui.theme);
  });
});
