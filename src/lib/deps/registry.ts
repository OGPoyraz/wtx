import type { DepsAdapter } from "./types.js";
import { bunAdapter } from "./adapters/bun.js";
import { pnpmAdapter } from "./adapters/pnpm.js";
import { yarnAdapter } from "./adapters/yarn.js";
import { npmAdapter } from "./adapters/npm.js";
import { cargoAdapter } from "./adapters/cargo.js";
import { pythonAdapter } from "./adapters/python.js";
import { goAdapter } from "./adapters/go.js";

export const REGISTRY: DepsAdapter[] = [
  bunAdapter,
  pnpmAdapter,
  yarnAdapter,
  npmAdapter,
  cargoAdapter,
  pythonAdapter,
  goAdapter,
];

export function resolveAdapter(
  dir: string,
  managerOverride: string | undefined
): DepsAdapter | null {
  if (managerOverride && managerOverride !== "auto") {
    return REGISTRY.find((a) => a.id === managerOverride) ?? null;
  }
  return REGISTRY.find((a) => a.detect(dir)) ?? null;
}
