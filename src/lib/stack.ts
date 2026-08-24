import fs from "fs";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { gitExec } from "./git.js";

export interface StackEntry {
  baseRef: string;
  baseSha: string;
  explicit: boolean;
  createdAt: string;
}

export interface StackMetadata {
  version: 1;
  branches: Record<string, StackEntry>;
}

export interface StackDisplayNode<T> {
  item: T;
  depth: number;
  prefix: string;
}

function emptyMetadata(): StackMetadata {
  return { version: 1, branches: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadata(value: unknown): StackMetadata {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.branches)) {
    throw new Error("invalid format or version");
  }

  const branches: Record<string, StackEntry> = {};
  for (const [branch, rawEntry] of Object.entries(value.branches)) {
    if (!isRecord(rawEntry)) continue;
    if (typeof rawEntry.baseRef !== "string" || typeof rawEntry.baseSha !== "string") continue;

    branches[branch] = {
      baseRef: rawEntry.baseRef,
      baseSha: rawEntry.baseSha,
      explicit: rawEntry.explicit === true,
      createdAt: typeof rawEntry.createdAt === "string" ? rawEntry.createdAt : "",
    };
  }

  return { version: 1, branches };
}

async function metadataPath(repoPath: string, opts: GlobalOptions): Promise<string | null> {
  const commonDirOutput = await gitExec(
    ["-C", repoPath, "rev-parse", "--git-common-dir"],
    { ...opts, dryRun: false }
  );
  const commonDir = commonDirOutput.trim();
  if (!commonDir) return null;

  const resolvedCommonDir = path.isAbsolute(commonDir)
    ? commonDir
    : path.resolve(repoPath, commonDir);
  return path.join(resolvedCommonDir, "wtx", "stack.json");
}

export async function readStackMetadata(
  repoPath: string,
  opts: GlobalOptions = { verbose: false, dryRun: false }
): Promise<StackMetadata> {
  const filePath = await metadataPath(repoPath, opts);
  if (!filePath || !fs.existsSync(filePath)) return emptyMetadata();

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return parseMetadata(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read stack metadata: ${message}`);
  }
}

async function writeStackMetadata(
  repoPath: string,
  metadata: StackMetadata,
  opts: GlobalOptions
): Promise<void> {
  if (opts.dryRun) return;
  const filePath = await metadataPath(repoPath, opts);
  if (!filePath) return;

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export async function recordStackEntry(
  repoPath: string,
  branch: string,
  entry: StackEntry,
  opts: GlobalOptions
): Promise<void> {
  const metadata = await readStackMetadata(repoPath, opts);
  metadata.branches[branch] = entry;
  await writeStackMetadata(repoPath, metadata, opts);
}

export async function removeStackEntry(
  repoPath: string,
  branch: string,
  opts: GlobalOptions
): Promise<void> {
  const metadata = await readStackMetadata(repoPath, opts);
  if (!metadata.branches[branch]) return;
  delete metadata.branches[branch];
  await writeStackMetadata(repoPath, metadata, opts);
}

export async function renameStackEntry(
  repoPath: string,
  oldBranch: string,
  newBranch: string,
  opts: GlobalOptions
): Promise<void> {
  const metadata = await readStackMetadata(repoPath, opts);
  const entry = metadata.branches[oldBranch];
  let changed = false;

  if (entry) {
    metadata.branches[newBranch] = entry;
    delete metadata.branches[oldBranch];
    changed = true;
  }

  for (const child of Object.values(metadata.branches)) {
    if (child.baseRef !== oldBranch && child.baseRef !== `refs/heads/${oldBranch}`) continue;
    child.baseRef = newBranch;
    changed = true;
  }

  if (changed) await writeStackMetadata(repoPath, metadata, opts);
}

export function getStackChildren(metadata: StackMetadata, branch: string): string[] {
  return Object.entries(metadata.branches)
    .filter(([, entry]) => entry.baseRef === branch || entry.baseRef === `refs/heads/${branch}`)
    .map(([child]) => child)
    .sort((a, b) => a.localeCompare(b));
}

export function getStackAncestors(metadata: StackMetadata, branch: string): string[] {
  const ancestors = [branch];
  const seen = new Set([branch]);
  let current = branch;

  while (true) {
    const entry = metadata.branches[current];
    if (!entry || seen.has(entry.baseRef)) break;
    ancestors.unshift(entry.baseRef);
    seen.add(entry.baseRef);
    current = entry.baseRef;
  }

  return ancestors;
}

function resolveParentBranch(baseRef: string | undefined, branches: Set<string>): string | null {
  if (!baseRef) return null;
  if (branches.has(baseRef)) return baseRef;

  const headRef = baseRef.replace(/^refs\/heads\//, "");
  if (branches.has(headRef)) return headRef;

  const remoteRef = baseRef.replace(/^refs\/remotes\/[^/]+\//, "");
  if (branches.has(remoteRef)) return remoteRef;

  const slash = baseRef.indexOf("/");
  if (slash > 0) {
    const shortRef = baseRef.substring(slash + 1);
    if (branches.has(shortRef)) return shortRef;
  }

  return null;
}

export function buildStackHierarchy<T>(
  items: T[],
  getBranch: (item: T) => string | undefined,
  getBase: (item: T) => string | undefined,
  compare: (a: T, b: T) => number
): StackDisplayNode<T>[] {
  const branchNames = new Set(
    items
      .map(getBranch)
      .filter((branch): branch is string => branch !== undefined)
  );
  const byBranch = new Map<string, T>();
  const children = new Map<string, T[]>();
  const roots: T[] = [];

  for (const item of items) {
    const branch = getBranch(item);
    if (branch) byBranch.set(branch, item);
  }

  for (const item of items) {
    const branch = getBranch(item);
    const parent = resolveParentBranch(getBase(item), branchNames);
    if (!parent || parent === branch || !byBranch.has(parent)) {
      roots.push(item);
      continue;
    }

    const siblings = children.get(parent) ?? [];
    siblings.push(item);
    children.set(parent, siblings);
  }

  const result: StackDisplayNode<T>[] = [];
  const visited = new Set<string>();

  const visit = (item: T, depth: number, ancestorPrefix: string, isLast: boolean): void => {
    const branch = getBranch(item);
    if (branch && visited.has(branch)) return;
    if (branch) visited.add(branch);

    const prefix = depth === 0 ? "" : `${ancestorPrefix}${isLast ? "└─ " : "├─ "}`;
    result.push({ item, depth, prefix });

    const childRows = [...(branch ? children.get(branch) ?? [] : [])].sort(compare);
    const childPrefix = depth === 0 ? "" : `${ancestorPrefix}${isLast ? "   " : "│  "}`;
    childRows.forEach((child, index) => {
      visit(child, depth + 1, childPrefix, index === childRows.length - 1);
    });
  };

  roots.sort(compare).forEach((root) => visit(root, 0, "", true));

  // Invalid or cyclic metadata should not hide worktrees from the dashboard.
  for (const item of items) {
    const branch = getBranch(item);
    if (!branch || !visited.has(branch)) visit(item, 0, "", true);
  }

  return result;
}
