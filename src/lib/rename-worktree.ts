import fs from "fs";
import path from "path";
import type { GlobalOptions, RepoContext } from "../types.js";
import { gitExec, getWorktreeList, localBranchExists } from "./git.js";
import { findWorktreeForBranch, getWorktreePath } from "./resolver.js";
import { cleanupEmptyParents } from "./path-safety.js";
import { syncEntry } from "./worktree-setup.js";
import { addMember, findWorkspacesForMember, removeMember } from "./workspace.js";

export interface RenameOutcome {
  oldBranch: string;
  newBranch: string;
  oldPath: string;
  newPath: string;
  upstream: string | null;
  cleanedDirs: string[];
  dirtyFiles: string[];
  lostDirtyFiles: string[];
  resyncedFiles: string[];
  keptLocalSyncFiles: string[];
  updatedWorkspaces: string[];
  workspaceWarnings: string[];
}

async function getUpstream(wtPath: string): Promise<string | null> {
  try {
    const out = await gitExec(["-C", wtPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {});
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function getDirtyEntries(wtPath: string): Promise<string[]> {
  try {
    const out = await gitExec(["-C", wtPath, "status", "--porcelain"], {});
    return out.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function touchesEntry(porcelainLine: string, entry: string): boolean {
  const entryPath = porcelainLine.slice(3);
  return entryPath === entry || entryPath.startsWith(`${entry}/`);
}

async function isTrackedInWorktree(wtPath: string, entry: string): Promise<boolean> {
  try {
    await gitExec(["-C", wtPath, "ls-files", "--error-unmatch", "--", entry], {});
    return true;
  } catch {
    return false;
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
  workspaceRoot?: string;
}): Promise<RenameOutcome> {
  const { repo, oldBranch, newBranch, opts } = params;

  const planned = await planRename(repo, oldBranch, newBranch, opts);
  const cleanedDirs: string[] = [];
  const dirtyBefore = await getDirtyEntries(planned.worktreePath);
  const updatedWorkspaces: string[] = [];
  const workspaceWarnings: string[] = [];

  if (opts.dryRun) {
    return {
      oldBranch,
      newBranch,
      oldPath: planned.worktreePath,
      newPath: planned.newPath,
      upstream: planned.upstream,
      cleanedDirs,
      dirtyFiles: dirtyBefore,
      lostDirtyFiles: [],
      resyncedFiles: [],
      keptLocalSyncFiles: [],
      updatedWorkspaces,
      workspaceWarnings,
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

  const dirtyAfter = await getDirtyEntries(planned.newPath);
  const lostDirtyFiles = dirtyBefore.filter((line) => !dirtyAfter.includes(line));

  const resyncedFiles: string[] = [];
  const keptLocalSyncFiles: string[] = [];
  for (const entry of repo.config.sync_files ?? []) {
    if (!fs.existsSync(path.join(repo.mainPath, entry))) continue;

    const destPath = path.join(planned.newPath, entry);
    if (!fs.existsSync(destPath)) {
      if (syncEntry(repo.mainPath, planned.newPath, entry)) {
        resyncedFiles.push(entry);
      }
      continue;
    }

    const tracked = await isTrackedInWorktree(planned.newPath, entry);
    if (tracked && !dirtyAfter.some((line) => touchesEntry(line, entry))) {
      if (syncEntry(repo.mainPath, planned.newPath, entry)) {
        resyncedFiles.push(entry);
      }
      continue;
    }

    keptLocalSyncFiles.push(entry);
  }

  const workspaceRoot = params.workspaceRoot ?? path.join(path.dirname(repo.mainPath), "wtx-workspaces");

  let affectedWorkspaces: string[] = [];
  try {
    affectedWorkspaces = await findWorkspacesForMember(workspaceRoot, repo.name, oldBranch);
  } catch (err: unknown) {
    workspaceWarnings.push(`workspace lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const workspaceName of affectedWorkspaces) {
    const workspacePath = path.join(workspaceRoot, workspaceName);
    try {
      await removeMember({ workspacePath, repo: repo.name, branch: oldBranch });
      await addMember({
        workspacePath,
        member: { repo: repo.name, branch: newBranch, path: planned.newPath },
      });
      updatedWorkspaces.push(workspaceName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      workspaceWarnings.push(`workspace "${workspaceName}": ${message}`);
    }
  }

  return {
    oldBranch,
    newBranch,
    oldPath: planned.worktreePath,
    newPath: planned.newPath,
    upstream: planned.upstream,
    cleanedDirs,
    dirtyFiles: dirtyAfter,
    lostDirtyFiles,
    resyncedFiles,
    keptLocalSyncFiles,
    updatedWorkspaces,
    workspaceWarnings,
  };
}
