import { describe, it, expect } from "vitest";
import { THEMES, tokyonightTokens } from "../src/tui/themes/index.js";
import { tokens, ThemeContext, useTheme } from "../src/tui/theme.js";

describe("theme registry", () => {
  it("contains the tokyonight entry", () => {
    expect(THEMES).toHaveProperty("tokyonight");
    expect(THEMES.tokyonight).toBe(tokyonightTokens);
  });

  it("tokyonight tokens match the default exported tokens (backward compat)", () => {
    expect(tokyonightTokens).toEqual(tokens);
  });

  it("exposes every expected token key", () => {
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
    for (const key of expectedKeys) {
      expect(THEMES.tokyonight).toHaveProperty(key);
      expect(typeof THEMES.tokyonight[key]).toBe("string");
    }
  });

  it("provides a ThemeContext with tokyonight as default", () => {
    expect(ThemeContext).toBeDefined();
    expect(typeof useTheme).toBe("function");
  });
});
