import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import type { DepsAdapter, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { info } from "../../log.js";

function compareFiles(f1: string, f2: string): boolean {
  const f1Exists = existsSync(f1);
  const f2Exists = existsSync(f2);
  if (!f1Exists && !f2Exists) return true;
  if (f1Exists !== f2Exists) return false;
  return Buffer.compare(readFileSync(f1), readFileSync(f2)) === 0;
}

export const goAdapter: DepsAdapter = {
  id: "go",
  displayName: "go",
  
  detect: (dir: string) => existsSync(join(dir, "go.mod")),
  
  lockfileNames: ["go.mod", "go.sum"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    const modMatch = compareFiles(join(wtPath, "go.mod"), join(mainPath, "go.mod"));
    const sumMatch = compareFiles(join(wtPath, "go.sum"), join(mainPath, "go.sum"));
    return modMatch && sumMatch;
  },
  
  currentState: (wtPath: string, mainPath: string) => {
    const wtSum = join(wtPath, "go.sum");
    const mainSum = join(mainPath, "go.sum");
    const lockMatch = goAdapter.definitionsMatch(wtPath, mainPath);
    
    if (!existsSync(wtSum) && existsSync(mainSum)) {
      return {
        state: "missing",
        lockfileMatch: lockMatch,
        repairHint: "run sync to download modules",
      };
    }
    
    if (!lockMatch) {
      return {
        state: "independent",
        lockfileMatch: false,
        repairHint: "definitions differ from main — run sync",
      };
    }
    
    return {
      state: "installed",
      lockfileMatch: true,
    };
  },
  
  sync: async (ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome> => {
    if (ctx.strategy === "off") {
      return { action: "skipped" };
    }
    
    if (ctx.dryRun) {
      info("[dry-run] go mod download");
      return { action: "skipped", detail: "Dry run: would download modules to global cache" };
    }
    
    try {
      await execa("go", ["mod", "download"], { cwd: ctx.wtPath });
      return {
        action: "installed",
        detail: "Downloaded to machine-global Go module cache (naturally shared)",
      };
    } catch (e: unknown) {
      return {
        action: "failed",
        detail: String(e),
      };
    }
  },
};
