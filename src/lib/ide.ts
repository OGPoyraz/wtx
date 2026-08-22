import { execa } from "execa";
import type { Config } from "../types.js";

export function resolveIde(explicit: string | undefined, config: Config): string | undefined {
  return explicit ?? config.ide ?? process.env["EDITOR"];
}

export function spawnIde(ide: string, wtPath: string): void {
  const subprocess = execa(ide, [wtPath], { detached: true, stdio: "ignore", cleanup: false });
  subprocess.catch(() => {});
}
