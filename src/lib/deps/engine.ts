import fs from "fs";
import path from "path";
import { execa } from "execa";
import type { DepsAdapter, DepsStrategy, SyncContext, SyncOutcome, LinkageState } from "./types.js";
import { resolveAdapter as registryResolve } from "./registry.js";
import { performSafeLink } from "./linking.js";
import { getWorkspaceDelta } from "./diff.js";
import { stepProgress, stepSuccess, stepWarning, info } from "../log.js";
import { isWithin, safeResolve } from "../path-safety.js";

export function resolveAdapter(dir: string, managerOverride?: string): DepsAdapter | null {
  return registryResolve(dir, managerOverride);
}

export function performLegacySymlink(wtPath: string, mainPath: string, dryRun: boolean, quiet?: boolean) {
  const nmPath = path.join(wtPath, "node_modules");
  const mainNm = path.join(mainPath, "node_modules");

  if (!fs.existsSync(mainNm)) {
    if (!quiet) stepWarning("Main repo has no node_modules to symlink to");
    return;
  }

  if (!quiet) stepWarning("Using legacy whole-directory symlink. Modifying dependencies in worktree will mutate main checkout!");

  let existingLink = false;
  let shouldRemove = false;
  try {
    const stat = fs.lstatSync(nmPath);
    existingLink = stat.isSymbolicLink();
    shouldRemove = true;
  } catch {}

  if (shouldRemove) {
    if (existingLink) {
      if (!quiet) stepProgress("Removing existing symlink...");
    } else {
      if (!quiet) stepProgress("Removing node_modules...");
    }
    
    if (!dryRun) {
      if (existingLink) {
        fs.unlinkSync(nmPath);
      } else {
        fs.rmSync(nmPath, { recursive: true, force: true });
      }
    }
  }

  if (dryRun) {
    if (!quiet) info(`  [dry-run] Would symlink ${mainNm} to ${nmPath}`);
  } else {
    fs.symlinkSync(mainNm, nmPath);
  }
  if (!quiet) stepSuccess("Symlinked node_modules", mainNm);
}

export function detectCommonLinkageState(wtPath: string, mainPath: string): { state: LinkageState, target?: string } {
  const nodeModulesPath = path.join(wtPath, "node_modules");

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
        return { state: "broken", target };
      }

      if (!isWithin(resolvedMain, resolvedTarget) && resolvedTarget !== path.join(resolvedMain, "node_modules")) {
        return { state: "external", target };
      }

      return { state: "linked-whole", target };
    } else if (stat.isDirectory()) {
      // Check if it's safe-linked
      // A quick heuristic: if top-level folders are symlinks, it's "linked-packages"
      let isLinkedPackages = false;
      try {
        const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isSymbolicLink()) {
            isLinkedPackages = true;
            break;
          }
        }
      } catch {}

      if (isLinkedPackages) {
        return { state: "linked-packages" };
      }
      return { state: "installed" };
    }
  } catch {
    if (!fs.existsSync(nodeModulesPath)) {
      return { state: "missing" };
    }
  }
  return { state: "installed" };
}

export async function runInstallCommand(cmd: string, args: string[], wtPath: string, dryRun: boolean, quiet?: boolean) {
  const fullCmd = [cmd, ...args].join(" ");
  if (!quiet) stepProgress(`Running ${fullCmd}...`);
  if (dryRun) {
    if (!quiet) info(`  [dry-run] Would execute: ${fullCmd} in ${wtPath}`);
  } else {
    await execa(cmd, args, { cwd: wtPath, stdio: "inherit" });
  }
  if (!quiet) stepSuccess("Dependencies installed");
}

export function executeSync(
  adapter: DepsAdapter,
  ctx: SyncContext & { strategy: DepsStrategy },
  installCmd: string,
  installArgs: string[],
  getTargetedInstallArgs: (workspaces: string[]) => string[] | null
): Promise<SyncOutcome> {
  const { strategy, wtPath, mainPath, dryRun } = ctx;
  const quiet = false;

  if (strategy === "off") {
    if (!quiet) info("  Dependency sync skipped (strategy: off)");
    return Promise.resolve({ action: "skipped" });
  }

  if (strategy === "symlink") {
    performLegacySymlink(wtPath, mainPath, dryRun, quiet);
    return Promise.resolve({ action: "linked" });
  }

  if (strategy === "link") {
    performSafeLink(wtPath, mainPath, dryRun, quiet);
    return Promise.resolve({ action: "linked" });
  }

  if (strategy === "install") {
    return runInstallCommand(installCmd, installArgs, wtPath, dryRun, quiet).then(() => ({ action: "installed" }));
  }

  if (strategy === "auto") {
    const delta = getWorkspaceDelta(wtPath, mainPath, adapter.lockfileNames);
    if (delta.rootMatches && delta.changedWorkspaces.length === 0) {
      performSafeLink(wtPath, mainPath, dryRun, quiet);
      return Promise.resolve({ action: "linked" });
    }

    if (delta.rootMatches && delta.changedWorkspaces.length > 0) {
      const targetedArgs = getTargetedInstallArgs(delta.changedWorkspaces);
      if (targetedArgs) {
        return runInstallCommand(installCmd, targetedArgs, wtPath, dryRun, quiet).then(() => ({ action: "installed" }));
      } else {
        if (!quiet) stepWarning(`${adapter.displayName} does not support targeted install for workspaces. Running full install.`);
        return runInstallCommand(installCmd, installArgs, wtPath, dryRun, quiet).then(() => ({ action: "installed" }));
      }
    }

    return runInstallCommand(installCmd, installArgs, wtPath, dryRun, quiet).then(() => ({ action: "installed" }));
  }

  return Promise.resolve({ action: "skipped" });
}
