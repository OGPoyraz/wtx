import fs from "fs";
import path from "path";
import type { GlobalOptions, RepoContext } from "../types.js";
import { gitExec, getWorktreeList, localBranchExists } from "./git.js";
import { findWorktreeForBranch, getWorktreePath } from "./resolver.js";
import { cleanupEmptyParents } from "./path-safety.js";

export interface RenameOutcome {
  oldBranch: string;
  newBranch: string;
  oldPath: string;
  newPath: string;
  upstream: string | null;
  cleanedDirs: string[];
}

async function getUpstream(wtPath: string): Promise<string | null> {
  try {
    const out = await gitExec(["-C", wtPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {});
    return out.trim() || null;
  } catch {
    return null;
  }
}

export async function planRename(
  repo: RepoContext,
  oldBranch: string,
  newBranch: string,
  opts: GlobalOptions
): Promise<{ worktreePath: string; newPath: string; upstream: string | null }> {
  const list = await getWorktreeList(repo.mainPath);
  const candidatePath = getWorktreePath(repo, oldBranch);
  const target = findWorktreeForBranch(list, oldBranch, repo.mainPath, candidatePath);

  if (!target) {
    throw new Error(`No worktree found for branch '${oldBranch}' at ${candidatePath}`);
  }

  if (target.isLocked) {
    throw new Error(`Worktree '${oldBranch}' is locked — unlock it before renaming`);
  }

  const newPath = `${repo.wtRoot}/${newBranch}`;
  if (fs.existsSync(newPath)) {
    throw new Error(`Target path already exists: ${newPath}`);
  }

  if (!opts.dryRun && (await localBranchExists(repo.mainPath, newBranch, opts))) {
    throw new Error(`Branch '${newBranch}' already exists`);
  }

  return { worktreePath: target.path, newPath, upstream: await getUpstream(target.path) };
}

export async function renameWorktree(params: {
  repo: RepoContext;
  oldBranch: string;
  newBranch: string;
  opts: GlobalOptions;
}): Promise<RenameOutcome> {
  const { repo, oldBranch, newBranch, opts } = params;

  const planned = await planRename(repo, oldBranch, newBranch, opts);
  const cleanedDirs: string[] = [];

  if (opts.dryRun) {
    return {
      oldBranch,
      newBranch,
      oldPath: planned.worktreePath,
      newPath: planned.newPath,
      upstream: planned.upstream,
      cleanedDirs,
    };
  }

  await gitExec(["-C", planned.worktreePath, "branch", "-m", oldBranch, newBranch], opts);

  try {
    fs.mkdirSync(path.dirname(planned.newPath), { recursive: true });
    await gitExec(["-C", repo.mainPath, "worktree", "move", planned.worktreePath, planned.newPath], opts);
  } catch (err: any) {
    try {
      await gitExec(["-C", planned.worktreePath, "branch", "-m", newBranch, oldBranch], opts);
    } catch {
      throw new Error(
        `Move failed (${err.message}) and branch rollback failed — manual fix needed: git branch -m ${newBranch} ${oldBranch}`
      );
    }
    throw new Error(`Failed to move worktree (branch rename rolled back): ${err.message}`);
  }

  for (const dir of cleanupEmptyParents(repo.wtRoot, repo.mainPath, planned.worktreePath)) {
    cleanedDirs.push(dir);
  }

  return {
    oldBranch,
    newBranch,
    oldPath: planned.worktreePath,
    newPath: planned.newPath,
    upstream: planned.upstream,
    cleanedDirs,
  };
}
