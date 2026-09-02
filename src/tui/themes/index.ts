import type { ThemeTokens } from "../theme.js";
import { tokyonightTokens } from "./tokyonight.js";
import { catppuccinMochaTokens } from "./catppuccin-mocha.js";
import { gruvboxDarkTokens } from "./gruvbox-dark.js";
import { nordTokens } from "./nord.js";
import { rosePineDawnTokens } from "./rose-pine-dawn.js";

export const THEMES: Record<string, ThemeTokens> = {
  tokyonight: tokyonightTokens,
  "catppuccin-mocha": catppuccinMochaTokens,
  "gruvbox-dark": gruvboxDarkTokens,
  nord: nordTokens,
  "rose-pine-dawn": rosePineDawnTokens,
};

export type ThemeName = keyof typeof THEMES;

export const DEFAULT_THEME_NAME = "tokyonight";

export function resolveThemeName(name: string | undefined | null): string {
  if (name && Object.prototype.hasOwnProperty.call(THEMES, name)) {
    return name;
  }
  return DEFAULT_THEME_NAME;
}

export function nextThemeName(current: string): string {
  const names = Object.keys(THEMES);
  const idx = names.indexOf(current);
  if (idx === -1) return names[0] ?? DEFAULT_THEME_NAME;
  return names[(idx + 1) % names.length] ?? DEFAULT_THEME_NAME;
}

export {
  tokyonightTokens,
  catppuccinMochaTokens,
  gruvboxDarkTokens,
  nordTokens,
  rosePineDawnTokens,
};
