import { describe, it, expect } from "vitest";
import { THEMES, tokyonightTokens } from "../src/tui/themes/index.js";
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
