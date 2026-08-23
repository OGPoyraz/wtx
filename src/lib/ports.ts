import fs from "fs";
import { getWorktreeList, type Worktree } from "./git.js";
import type { Config } from "../types.js";
import { safeResolve } from "./path-safety.js";
import { expandTilde } from "./config.js";

export function hashPort(key: string, min: number, max: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = h >>> 0;
  const range = max - min + 1;
  return min + (h % range);
}

export function probe(hashBase: number, taken: Iterable<number>, min: number, max: number): number {
  const takenSet = new Set(taken);
  const range = max - min + 1;
  if (takenSet.size >= range) {
    throw new Error(`All ports in range [${min}, ${max}] are taken.`);
  }

  let current = hashBase;
  while (takenSet.has(current)) {
    current++;
    if (current > max) {
      current = min;
    }
  }
  return current;
}

export async function getWorktreePort(
  repoName: string,
  branch: string,
  config: Config,
  currentWtPath?: string
): Promise<number> {
  const { min = 4100, max = 4999 } = config.ports ?? {};
  const myKey = `${repoName}/${branch}`;
  const myHash = hashPort(myKey, min, max);

  const root = expandTilde(config.root);
  const allRepos = Object.keys(config.repos);
  const taken = new Set<number>();

  for (const name of allRepos) {
    const mainPath = `${root}/${name}`;
    if (!fs.existsSync(mainPath)) {
      continue;
    }
    
    let wts: Worktree[] = [];
    try {
      wts = await getWorktreeList(mainPath);
    } catch (err) {
      continue;
    }

    for (const wt of wts) {
      if (
        currentWtPath &&
        name === repoName &&
        safeResolve(wt.path) === safeResolve(currentWtPath)
      ) {
        continue;
      }
      if (!currentWtPath && name === repoName && wt.branch === branch) {
        continue;
      }
      const otherKey = `${name}/${wt.branch}`;
      const otherHash = hashPort(otherKey, min, max);
      taken.add(otherHash);
    }
  }

  return probe(myHash, taken, min, max);
}
