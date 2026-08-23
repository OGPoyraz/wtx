import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execa, execaSync } from "execa";
import type { DepsAdapter, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { info } from "../../log.js";

function compareFiles(f1: string, f2: string): boolean {
  const f1Exists = existsSync(f1);
  const f2Exists = existsSync(f2);
  if (!f1Exists && !f2Exists) return true;
  if (f1Exists !== f2Exists) return false;
  return Buffer.compare(readFileSync(f1), readFileSync(f2)) === 0;
}

let uvAvailable: boolean | undefined = undefined;
function isUvAvailable(): boolean {
  if (uvAvailable !== undefined) return uvAvailable;
  try {
    const res = execaSync("uv", ["--version"], { reject: false });
    uvAvailable = res.exitCode === 0;
  } catch {
    uvAvailable = false;
  }
  return uvAvailable;
}

// Exported for testing so we can mock/override it
export function resetUvAvailable(val?: boolean) {
  uvAvailable = val;
}

export const pythonAdapter: DepsAdapter = {
  id: "python",
  displayName: "python",
  
  detect: (dir: string) => {
    try {
      const files = readdirSync(dir);
      return files.some(f => f === "pyproject.toml" || f === "setup.py" || (f.startsWith("requirements") && f.endsWith(".txt")));
    } catch {
      return false;
    }
  },
  
  lockfileNames: ["uv.lock", "requirements.txt", "pyproject.toml"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    const wtUv = join(wtPath, "uv.lock");
    const mainUv = join(mainPath, "uv.lock");
    if (existsSync(wtUv) || existsSync(mainUv)) {
      return compareFiles(wtUv, mainUv);
    }
    
    let reqFiles = new Set<string>();
    try {
      if (existsSync(wtPath)) readdirSync(wtPath).filter(f => f.startsWith("requirements") && f.endsWith(".txt")).forEach(f => reqFiles.add(f));
      if (existsSync(mainPath)) readdirSync(mainPath).filter(f => f.startsWith("requirements") && f.endsWith(".txt")).forEach(f => reqFiles.add(f));
    } catch {
      // ignore
    }
    
    if (reqFiles.size > 0) {
      for (const req of reqFiles) {
        if (!compareFiles(join(wtPath, req), join(mainPath, req))) {
          return false;
        }
      }
      return true;
    }
    
    const wtPyProject = join(wtPath, "pyproject.toml");
    const mainPyProject = join(mainPath, "pyproject.toml");
    return compareFiles(wtPyProject, mainPyProject);
  },
  
  currentState: (wtPath: string, mainPath: string) => {
    const match = pythonAdapter.definitionsMatch(wtPath, mainPath);
    const wtVenv = join(wtPath, ".venv");
    const mainVenv = join(mainPath, ".venv");
    
    const hasUvLock = existsSync(join(wtPath, "uv.lock")) || existsSync(join(mainPath, "uv.lock"));
    
    if (hasUvLock && !isUvAvailable()) {
      return {
        state: "independent",
        lockfileMatch: match,
        repairHint: "requires uv — install via https://docs.astral.sh/uv/",
      };
    }
    
    if (!existsSync(wtVenv) && existsSync(mainVenv)) {
      return {
        state: "missing",
        lockfileMatch: match,
        repairHint: "Python virtualenvs contain hardcoded paths—never symlink. Run sync to create a fresh venv.",
      };
    }
    
    if (!match) {
      return {
        state: "independent",
        lockfileMatch: false,
        repairHint: "definitions differ from main — run sync to update",
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
    
    if (!isUvAvailable()) {
      return {
        action: "failed",
        detail: "requires uv — install via https://docs.astral.sh/uv/",
      };
    }
    
    const hasUvLock = existsSync(join(ctx.wtPath, "uv.lock"));
    const hasReqs = existsSync(join(ctx.wtPath, "requirements.txt"));
    
    if (hasUvLock) {
      if (ctx.dryRun) {
        info("[dry-run] uv sync --frozen");
        return { action: "skipped", detail: "Dry run: would run uv sync --frozen (creates isolated .venv)" };
      }
      try {
        await execa("uv", ["sync", "--frozen"], { cwd: ctx.wtPath });
        return {
          action: "installed",
          detail: "Installed via uv sync. Python virtualenvs contain hardcoded shebang paths, so .venv was created fresh.",
        };
      } catch (e: unknown) {
        return { action: "failed", detail: String(e) };
      }
    } else if (hasReqs) {
      if (ctx.dryRun) {
        info("[dry-run] uv venv && uv pip sync requirements.txt");
        return { action: "skipped", detail: "Dry run: would run uv venv && uv pip sync requirements.txt (creates isolated .venv)" };
      }
      try {
        await execa("uv", ["venv"], { cwd: ctx.wtPath });
        await execa("uv", ["pip", "sync", "requirements.txt"], { cwd: ctx.wtPath });
        return {
          action: "installed",
          detail: "Best-effort install via uv venv + pip sync. Python virtualenvs contain hardcoded shebang paths, so .venv was created fresh.",
        };
      } catch (e: unknown) {
        return { action: "failed", detail: String(e) };
      }
    }
    
    return { action: "skipped", detail: "No uv.lock or requirements.txt found to sync" };
  },
};
