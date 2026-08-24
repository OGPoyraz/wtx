import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DepsAdapter, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { info } from "../../log.js";

function compareFiles(f1: string, f2: string): boolean {
  const f1Exists = existsSync(f1);
  const f2Exists = existsSync(f2);
  if (!f1Exists && !f2Exists) return true;
  if (f1Exists !== f2Exists) return false;
  return Buffer.compare(readFileSync(f1), readFileSync(f2)) === 0;
}

function getExpectedCargoConfig(mainPath: string): string {
  // Use forward slashes for cross-platform compatibility in config if needed, but absolute path is fine.
  // actually just template string.
  return `[build]\ntarget-dir = "${join(mainPath, "target")}"\n`;
}

function hasCorrectCargoConfig(wtPath: string, mainPath: string): boolean {
  const configPath = join(wtPath, ".cargo", "config.toml");
  if (!existsSync(configPath)) return false;
  const content = readFileSync(configPath, "utf-8");
  const expectedTarget = join(mainPath, "target");
  // A simple include check is enough, or regex
  // Let's check for target-dir = "..."
  const regex = /target-dir\s*=\s*['"](.*?)['"]/;
  const match = content.match(regex);
  if (match && match[1] === expectedTarget) {
    return true;
  }
  return false;
}

export const cargoAdapter: DepsAdapter = {
  id: "cargo",
  displayName: "cargo",
  
  detect: (dir: string) => existsSync(join(dir, "Cargo.toml")),
  
  lockfileNames: ["Cargo.toml", "Cargo.lock"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    return compareFiles(join(wtPath, "Cargo.lock"), join(mainPath, "Cargo.lock"));
  },
  
  currentState: (wtPath: string, mainPath: string) => {
    const lockMatch = cargoAdapter.definitionsMatch(wtPath, mainPath);
    
    if (hasCorrectCargoConfig(wtPath, mainPath)) {
      return {
        state: "shared-target",
        lockfileMatch: lockMatch,
      };
    }
    
    if (existsSync(join(wtPath, "target"))) {
      return {
        state: "independent",
        lockfileMatch: lockMatch,
        repairHint: "run sync to share build cache with main",
      };
    }
    
    return {
      state: "missing",
      lockfileMatch: lockMatch,
    };
  },
  
  sync: async (ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome> => {
    if (ctx.strategy === "off") {
      return { action: "skipped" };
    }
    
    if (hasCorrectCargoConfig(ctx.wtPath, ctx.mainPath)) {
      return { action: "skipped", detail: "Cargo target already shared with main" };
    }
    
    const expectedConfig = getExpectedCargoConfig(ctx.mainPath);
    
    if (ctx.dryRun) {
      info(`[dry-run] would write .cargo/config.toml with:\n${expectedConfig}`);
      return { action: "skipped", detail: "Dry run: would share target dir" };
    }
    
    const cargoDir = join(ctx.wtPath, ".cargo");
    if (!existsSync(cargoDir)) {
      mkdirSync(cargoDir, { recursive: true });
    }
    
    const configPath = join(cargoDir, "config.toml");
    
    // Append or replace. We'll just replace or write it.
    // If it exists but doesn't have the correct target-dir, appending might override or conflict.
    // Spec says: write .cargo/config.toml (mkdir parents) unless exists-correct.
    writeFileSync(configPath, expectedConfig, "utf-8");
    
    return {
      action: "linked",
      detail: "Shared build cache with main. Note: incremental artifacts safe across worktrees; different branches may trigger recompiles.",
    };
  },
};
