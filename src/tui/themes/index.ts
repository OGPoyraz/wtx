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

export {
  tokyonightTokens,
  catppuccinMochaTokens,
  gruvboxDarkTokens,
  nordTokens,
  rosePineDawnTokens,
};
