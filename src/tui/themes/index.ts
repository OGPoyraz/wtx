import type { ThemeTokens } from "../theme.js";
import { tokyonightTokens } from "./tokyonight.js";

export const THEMES: Record<string, ThemeTokens> = {
  tokyonight: tokyonightTokens,
};

export type ThemeName = keyof typeof THEMES;

export { tokyonightTokens };
