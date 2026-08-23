import fs from "fs";
import path from "path";

/**
 * Safely resolves a path, including resolving symlinks.
 * If a portion of the path does not exist, it resolves symlinks for the existing portion,
 * and appends the non-existing remainder.
 */
export function safeResolve(p: string): string {
  let current = path.resolve(p);
  const parts: string[] = [];
  
  while (current !== path.dirname(current)) {
    try {
      const real = fs.realpathSync.native(current);
      return path.resolve(real, ...parts.reverse());
    } catch {
      parts.push(path.basename(current));
      current = path.dirname(current);
    }
  }
  
  // Root directory
  try {
    const real = fs.realpathSync.native(current);
    return path.resolve(real, ...parts.reverse());
  } catch {
    return path.resolve(p);
  }
}

export function isWithin(root: string, candidate: string): boolean {
  const resolvedRoot = safeResolve(root);
  const resolvedCandidate = safeResolve(candidate);
  const rel = path.relative(resolvedRoot, resolvedCandidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Walks upward from `startPath` (exclusive) and returns the directories that
 * would be removed if `startPath` were deleted first — the single source of
 * truth shared by dry-run previews and actual cleanup, so they can't diverge.
 * STOPS at:
 * - The resolved `wtRoot`
 * - The resolved `mainPath`
 * - Any directory containing a `.git` file/folder
 */
export function planEmptyParentRemoval(wtRoot: string, mainPath: string, startPath: string): string[] {
  const resolvedWtRoot = safeResolve(wtRoot);
  const resolvedMainPath = safeResolve(mainPath);
  const resolvedStartPath = safeResolve(startPath);

  const planned: string[] = [];
  let currentDir = path.dirname(resolvedStartPath);

  while (isWithin(resolvedWtRoot, currentDir) || currentDir === resolvedWtRoot) {
    if (currentDir === resolvedWtRoot || currentDir === resolvedMainPath) {
      break;
    }

    try {
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        break;
      }
    } catch {
      break;
    }

    let contents: string[];
    try {
      contents = fs.readdirSync(currentDir);
    } catch {
      break;
    }

    const remaining = contents.filter(
      (c) => !planned.includes(path.join(currentDir, c)) && path.join(currentDir, c) !== resolvedStartPath
    );
    if (remaining.length !== 0) {
      break;
    }

    planned.push(currentDir);
    currentDir = path.dirname(currentDir);
  }

  return planned;
}

/**
 * Walks upward from `startPath` (exclusive) and deletes empty directories.
 * STOPS at:
 * - The resolved `wtRoot`
 * - The resolved `mainPath`
 * - Any directory containing a `.git` file/folder
 *
 * Returns an array of paths that were successfully removed.
 */
export function cleanupEmptyParents(wtRoot: string, mainPath: string, startPath: string): string[] {
  const planned = planEmptyParentRemoval(wtRoot, mainPath, startPath);
  const removed: string[] = [];

  for (const dir of planned) {
    try {
      fs.rmdirSync(dir);
      removed.push(dir);
    } catch {
      break;
    }
  }

  return removed;
}

export function isSafeWorktreeConfig(wtRoot: string, mainPath: string): boolean {
  const resolvedWtRoot = safeResolve(wtRoot);
  const resolvedMain = safeResolve(mainPath);

  if (resolvedWtRoot === resolvedMain) return false;
  if (isWithin(resolvedWtRoot, resolvedMain)) return false;
  if (isWithin(resolvedMain, resolvedWtRoot)) return false;

  return true;
}
