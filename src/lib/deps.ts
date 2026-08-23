import fs from "fs";
import path from "path";
import { execa } from "execa";
import type { GlobalOptions } from "../types.js";
import { stepProgress, stepSuccess, stepWarning, verbose } from "./log.js";
import { isWithin, safeResolve } from "./path-safety.js";

export interface DepsState {
  strategy: "symlinked" | "independent" | "none" | "broken" | "external" | "installed" | "missing";
  lockfileMatch: boolean;
  packageManager: "yarn" | "npm" | "pnpm" | "bun" | null;
  symlinkTarget?: string;
}

const LOCKFILES: Record<string, DepsState["packageManager"]> = {
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "bun.lockb": "bun",
  "bun.lock": "bun",
};

function detectPackageManager(dir: string): DepsState["packageManager"] {
  for (const [file, pm] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(dir, file))) {
      return pm;
    }
  }
  return null;
}

function getLockfileName(pm: DepsState["packageManager"]): string | null {
  if (!pm) return null;
  const map: Record<string, string> = {
    yarn: "yarn.lock",
    npm: "package-lock.json",
    pnpm: "pnpm-lock.yaml",
    bun: "bun.lock",
  };
  return map[pm] ?? null;
}

function lockfilesMatch(wtPath: string, mainPath: string, pm: DepsState["packageManager"]): boolean {
  const lockfile = getLockfileName(pm);
  if (!lockfile) return true;

  const wtLock = path.join(wtPath, lockfile);
  const mainLock = path.join(mainPath, lockfile);

  if (!fs.existsSync(wtLock) || !fs.existsSync(mainLock)) {
    return !fs.existsSync(wtLock) && !fs.existsSync(mainLock);
  }

  try {
    const wtContent = fs.readFileSync(wtLock);
    const mainContent = fs.readFileSync(mainLock);
    return wtContent.equals(mainContent);
  } catch {
    return false;
  }
}

export function detectDepsState(wtPath: string, mainPath: string): DepsState {
  const nodeModulesPath = path.join(wtPath, "node_modules");
  const pm = detectPackageManager(wtPath) ?? detectPackageManager(mainPath);
  const match = lockfilesMatch(wtPath, mainPath, pm);

  try {
    const stat = fs.lstatSync(nodeModulesPath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(nodeModulesPath);
      const resolvedTarget = path.resolve(wtPath, target);
      const resolvedMain = safeResolve(mainPath);
      
      let targetExists = false;
      try {
        fs.statSync(resolvedTarget);
        targetExists = true;
      } catch {
        targetExists = false;
      }

      if (!targetExists) {
        return { strategy: "broken", lockfileMatch: match, packageManager: pm, symlinkTarget: target };
      }

      if (!isWithin(resolvedMain, resolvedTarget) && resolvedTarget !== path.join(resolvedMain, "node_modules")) {
        return { strategy: "external", lockfileMatch: match, packageManager: pm, symlinkTarget: target };
      }

      return { strategy: "symlinked", lockfileMatch: match, packageManager: pm, symlinkTarget: target };
    }
  } catch {
    if (!fs.existsSync(nodeModulesPath)) {
      return { strategy: "missing", lockfileMatch: match, packageManager: pm };
    }
  }

  return { strategy: "installed", lockfileMatch: match, packageManager: pm };
}

function getInstallCommand(pm: DepsState["packageManager"]): string {
  switch (pm) {
    case "yarn": return "yarn install";
    case "npm": return "npm install";
    case "pnpm": return "pnpm install";
    case "bun": return "bun install";
    default: return "npm install";
  }
}

export async function autoInstallDeps(wtPath: string, mainPath: string, opts: GlobalOptions): Promise<void> {
  const state = detectDepsState(wtPath, mainPath);

  if (!state.packageManager) {
    verbose("No lockfile detected, skipping deps", opts.verbose);
    return;
  }

  if (state.lockfileMatch) {
    const mainNodeModules = path.join(mainPath, "node_modules");
    if (fs.existsSync(mainNodeModules)) {
      if (!opts.dryRun) {
        const nmPath = path.join(wtPath, "node_modules");
        if (fs.existsSync(nmPath)) {
          fs.rmSync(nmPath, { recursive: true, force: true });
        }
        fs.symlinkSync(mainNodeModules, nmPath);
      }
      stepSuccess("Symlinked node_modules", mainNodeModules);
    } else {
      await runInstall(wtPath, state.packageManager, opts);
    }
  } else {
    await runInstall(wtPath, state.packageManager, opts);
  }
}

async function runInstall(wtPath: string, pm: DepsState["packageManager"], opts: GlobalOptions): Promise<void> {
  const cmd = getInstallCommand(pm);
  stepProgress(`Running ${cmd}...`);
  if (!opts.dryRun) {
    await execa(cmd, { shell: true, cwd: wtPath, stdio: "inherit" });
  }
  stepSuccess("Dependencies installed");
}

export async function switchToInstall(wtPath: string, opts: GlobalOptions): Promise<void> {
  const nmPath = path.join(wtPath, "node_modules");

  try {
    const stat = fs.lstatSync(nmPath);
    if (stat.isSymbolicLink()) {
      stepProgress("Removing symlink...");
      if (!opts.dryRun) {
        fs.unlinkSync(nmPath);
      }
      stepSuccess("Symlink removed");
    }
  } catch {
  }

  const pm = detectPackageManager(wtPath);
  await runInstall(wtPath, pm, opts);
}

export async function switchToSymlink(wtPath: string, mainPath: string, opts: GlobalOptions): Promise<void> {
  const nmPath = path.join(wtPath, "node_modules");
  const mainNm = path.join(mainPath, "node_modules");

  if (!fs.existsSync(mainNm)) {
    stepWarning("Main repo has no node_modules to symlink to");
    return;
  }

  let existingLink = false;
  let shouldRemove = false;
  try {
    const stat = fs.lstatSync(nmPath);
    existingLink = stat.isSymbolicLink();
    shouldRemove = true;
  } catch {
  }

  if (shouldRemove) {
    if (existingLink) {
      const state = detectDepsState(wtPath, mainPath);
      if (state.strategy === "symlinked") {
        stepSuccess("Already symlinked", fs.readlinkSync(nmPath));
        return;
      }
      stepProgress("Removing bad symlink...");
    } else {
      stepProgress("Removing node_modules...");
    }
    
    if (!opts.dryRun) {
      if (existingLink) {
        fs.unlinkSync(nmPath);
      } else {
        fs.rmSync(nmPath, { recursive: true, force: true });
      }
    }
    stepSuccess(existingLink ? "Removed bad symlink" : "Removed node_modules");
  }

  if (!opts.dryRun) {
    fs.symlinkSync(mainNm, nmPath);
  }
  stepSuccess("Symlinked node_modules", mainNm);
}
