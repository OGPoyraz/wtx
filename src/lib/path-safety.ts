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
 * Walks upward from `startPath` (exclusive) and deletes empty directories.
 * STOPS at:
 * - The resolved `wtRoot`
 * - The resolved `mainPath` 
 * - Any directory containing a `.git` file/folder
 * 
 * Returns an array of paths that were successfully removed.
 */
export function cleanupEmptyParents(wtRoot: string, mainPath: string, startPath: string): string[] {
  const resolvedWtRoot = safeResolve(wtRoot);
  const resolvedMainPath = safeResolve(mainPath);
  const resolvedStartPath = safeResolve(startPath);
  
  const removed: string[] = [];
  let currentDir = path.dirname(resolvedStartPath);
  
  while (isWithin(resolvedWtRoot, currentDir) || currentDir === resolvedWtRoot) {
    // STOP if we hit wtRoot or mainPath (we never delete them, even if empty)
    if (currentDir === resolvedWtRoot || currentDir === resolvedMainPath) {
      break;
    }
    
    // STOP if we see a .git file/folder (should never delete repos)
    try {
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        break;
      }
    } catch {
      // ignore
    }

    try {
      const contents = fs.readdirSync(currentDir);
      if (contents.length === 0) {
        fs.rmdirSync(currentDir);
        removed.push(currentDir);
      } else {
        // Not empty, stop walking
        break;
      }
    } catch {
      // Permission error or directory doesn't exist, stop
      break;
    }
    
    const nextDir = path.dirname(currentDir);
    if (nextDir === currentDir) break; // Reached fs root somehow
    currentDir = nextDir;
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
