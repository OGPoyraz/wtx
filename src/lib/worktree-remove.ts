import fs from "fs";
import type { GlobalOptions } from "../types.js";
import { gitExec } from "./git.js";

export function isSubmoduleWorktreeError(message: string): boolean {
  return message.includes("submodule") || message.includes("containing submodules");
}

export function isMissingWorktreePathError(message: string): boolean {
  return message.includes("ENOENT")
    || message.includes("No such file")
    || message.includes("does not exist")
    || message.includes("not a git repository")
    || message.includes("cannot change to");
}

export function isRecoverableWorktreeRemoveError(message: string): boolean {
  return message.includes("not a working tree")
    || message.includes("already removed")
    || isSubmoduleWorktreeError(message)
    || isMissingWorktreePathError(message);
}

export interface RemoveWorktreeResult {
  usedForce: boolean;
  manualCleanup: boolean;
}

function removePathIfExists(wtPath: string, opts: GlobalOptions): void {
  if (!opts.dryRun && fs.existsSync(wtPath)) {
    fs.rmSync(wtPath, { recursive: true, force: true });
  }
}

async function pruneWorktreeAdmin(mainPath: string, opts: GlobalOptions): Promise<void> {
  try {
    await gitExec(["-C", mainPath, "worktree", "prune"], opts);
  } catch {
  }
}

export async function removeWorktreeSafely(params: {
  mainPath: string;
  wtPath: string;
  force: boolean;
  opts: GlobalOptions;
}): Promise<RemoveWorktreeResult> {
  const { mainPath, wtPath, force, opts } = params;

  const args = ["-C", mainPath, "worktree", "remove", wtPath];
  if (force) {
    args.push("--force");
  }

  try {
    await gitExec(args, opts);
    return { usedForce: force, manualCleanup: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (isSubmoduleWorktreeError(msg) && !force) {
      try {
        await gitExec(["-C", mainPath, "worktree", "remove", "--force", wtPath], opts);
        return { usedForce: true, manualCleanup: false };
      } catch (forceErr: unknown) {
        const forceMsg = forceErr instanceof Error ? forceErr.message : String(forceErr);
        if (isRecoverableWorktreeRemoveError(forceMsg)) {
          await pruneWorktreeAdmin(mainPath, opts);
          removePathIfExists(wtPath, opts);
          return { usedForce: true, manualCleanup: true };
        }
        throw forceErr;
      }
    }

    if (isRecoverableWorktreeRemoveError(msg)) {
      await pruneWorktreeAdmin(mainPath, opts);
      removePathIfExists(wtPath, opts);
      return { usedForce: force, manualCleanup: true };
    }

    throw err;
  }
}
