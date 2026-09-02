import fs from "node:fs";
import path from "node:path";
import { gitExec } from "./git.js";
import { readStackMetadata } from "./stack.js";

export type ChangeScope = "worktree" | "staged" | "base";

export interface ChangedFile {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface FileDiff {
  path: string;
  scope: ChangeScope;
  binary: boolean;
  diff: string;
  truncated: boolean;
}

interface ChangeOptions {
  repoPath: string;
  branch: string;
  scope: ChangeScope;
  invalidate?: boolean;
}

interface FileDiffOptions extends ChangeOptions {
  filePath: string;
}

interface CacheEntry<T> {
  head: string;
  value: T;
}

const maxDiffLines = 500;
const listCache = new Map<string, CacheEntry<ChangedFile[]>>();
const diffCache = new Map<string, CacheEntry<FileDiff>>();

function cacheKey(opts: ChangeOptions, filePath?: string): string {
  return [opts.repoPath, opts.branch, opts.scope, filePath ?? ""].join("\0");
}

async function currentHead(repoPath: string): Promise<string | null> {
  try {
    const head = await gitExec(["-C", repoPath, "rev-parse", "HEAD"]);
    return head.trim() || null;
  } catch {
    return null;
  }
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await gitExec(["-C", repoPath, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function resolveBaseRef(repoPath: string, branch: string): Promise<string | null> {
  try {
    const metadata = await readStackMetadata(repoPath, { verbose: false, dryRun: false });
    const recorded = metadata.branches[branch];
    if (recorded?.baseRef && await refExists(repoPath, recorded.baseRef)) {
      return recorded.baseRef;
    }
  } catch {
    // Fall through to common default branch names.
  }

  for (const ref of ["main", "master"]) {
    if (await refExists(repoPath, ref)) return ref;
  }

  return null;
}

async function diffArgs(opts: ChangeOptions, filePath?: string): Promise<string[] | null> {
  const args = ["-C", opts.repoPath, "diff", "--no-ext-diff", "--no-renames"];

  if (opts.scope === "staged") {
    args.push("--cached");
  } else if (opts.scope === "base") {
    const baseRef = await resolveBaseRef(opts.repoPath, opts.branch);
    if (!baseRef) return null;
    args.push(`${baseRef}...HEAD`);
  }

  if (filePath) args.push("--", filePath);
  return args;
}

function parseNameStatus(stdout: string): Map<string, string> {
  const statuses = new Map<string, string>();
  const parts = stdout.split("\0").filter(Boolean);

  for (let index = 0; index + 1 < parts.length; index += 2) {
    const status = parts[index];
    const filePath = parts[index + 1];
    if (status && filePath) statuses.set(filePath, status.charAt(0));
  }

  return statuses;
}

function parseNumstat(stdout: string, statuses: Map<string, string>): ChangedFile[] {
  const files: ChangedFile[] = [];
  const entries = stdout.split("\0").filter(Boolean);

  for (const entry of entries) {
    const [addedRaw, removedRaw, filePath] = entry.split("\t");
    if (!addedRaw || !removedRaw || !filePath) continue;

    const binary = addedRaw === "-" && removedRaw === "-";
    files.push({
      path: filePath,
      status: statuses.get(filePath) ?? "M",
      added: binary ? 0 : Number.parseInt(addedRaw, 10),
      removed: binary ? 0 : Number.parseInt(removedRaw, 10),
      binary,
    });
  }

  return files;
}

async function isSubmodule(repoPath: string, filePath: string): Promise<boolean> {
  try {
    const stdout = await gitExec(["-C", repoPath, "ls-files", "--stage", "--", filePath]);
    return stdout.split("\n").some((line) => line.startsWith("160000 "));
  } catch {
    return false;
  }
}

function truncateDiff(diff: string): { diff: string; truncated: boolean } {
  const lines = diff.split("\n");
  if (lines.length <= maxDiffLines) return { diff, truncated: false };

  const remaining = lines.length - maxDiffLines;
  return {
    diff: [...lines.slice(0, maxDiffLines), `[... ${remaining} more lines truncated ...]`].join("\n"),
    truncated: true,
  };
}

export async function getChangedFiles(opts: ChangeOptions): Promise<ChangedFile[]> {
  const head = await currentHead(opts.repoPath);
  if (!head) return [];

  const key = cacheKey(opts);
  const cached = listCache.get(key);
  if (!opts.invalidate && cached?.head === head && opts.scope !== "worktree") return cached.value;

  try {
    const baseArgs = await diffArgs(opts);
    if (!baseArgs) return [];

    const [nameStatus, numstat] = await Promise.all([
      gitExec([...baseArgs, "--name-status", "-z"]),
      gitExec([...baseArgs, "--numstat", "-z"]),
    ]);
    const statuses = parseNameStatus(nameStatus);
    const files = parseNumstat(numstat, statuses);
    const filtered: ChangedFile[] = [];

    for (const file of files) {
      if (!await isSubmodule(opts.repoPath, file.path)) filtered.push(file);
    }

    if (opts.scope === "worktree") {
      try {
        const untrackedRaw = await gitExec(["-C", opts.repoPath, "ls-files", "--others", "--exclude-standard", "-z"]);
        const untrackedPaths = untrackedRaw.split("\0").filter(Boolean);
        for (const p of untrackedPaths) {
          if (filtered.some(f => f.path === p)) continue;
          if (await isSubmodule(opts.repoPath, p)) continue;
          try {
            const full = path.join(opts.repoPath, p);
            const buf = fs.readFileSync(full);
            const binary = buf.includes(0);
            const str = binary ? "" : buf.toString("utf8");
            const added = binary ? 0 : str.split("\n").length;
            filtered.push({ path: p, status: "A", added, removed: 0, binary });
          } catch {
            filtered.push({ path: p, status: "A", added: 1, removed: 0, binary: false });
          }
        }
      } catch {}
    }

    listCache.set(key, { head, value: filtered });
    return filtered;
  } catch {
    return [];
  }
}

export async function getFileDiff(opts: FileDiffOptions): Promise<FileDiff> {
  const empty: FileDiff = {
    path: opts.filePath,
    scope: opts.scope,
    binary: false,
    diff: "",
    truncated: false,
  };
  const head = await currentHead(opts.repoPath);
  if (!head) return empty;

  const key = cacheKey(opts, opts.filePath);
  const cached = diffCache.get(key);
  if (!opts.invalidate && cached?.head === head) return cached.value;

  try {
    const changedFiles = await getChangedFiles(opts);
    const changedFile = changedFiles.find((file) => file.path === opts.filePath);
    if (!changedFile || await isSubmodule(opts.repoPath, opts.filePath)) return empty;

    const binary = changedFile.binary;
    if (binary) {
      const value = { ...empty, binary };
      diffCache.set(key, { head, value });
      return value;
    }

    const args = await diffArgs(opts, opts.filePath);
    if (!args) return empty;

    let rawDiff = await gitExec(args);
    if (!rawDiff && opts.scope === "worktree" && changedFile.status === "A") {
      try {
        const full = path.join(opts.repoPath, opts.filePath);
        const buf = fs.readFileSync(full);
        if (!buf.includes(0)) {
          const content = buf.toString("utf8");
          const lines = content.split("\n");
          const header = `diff --git a/${opts.filePath} b/${opts.filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${opts.filePath}\n@@ -0,0 +1,${lines.length} @@\n`;
          rawDiff = header + lines.map(l => `+${l}`).join("\n");
        }
      } catch {}
    }
    const { diff, truncated } = truncateDiff(rawDiff);
    const value = { ...empty, diff, truncated };
    diffCache.set(key, { head, value });
    return value;
  } catch {
    return empty;
  }
}
