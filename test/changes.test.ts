import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createTempDir } from "./setup.js";
import { getChangedFiles, getFileDiff } from "../src/lib/changes.js";
import { recordStackEntry } from "../src/lib/stack.js";

const opts = { verbose: false, dryRun: false };

beforeAll(() => {
  process.env.GIT_AUTHOR_NAME = "wtx-test";
  process.env.GIT_AUTHOR_EMAIL = "wtx-test@example.com";
  process.env.GIT_COMMITTER_NAME = "wtx-test";
  process.env.GIT_COMMITTER_EMAIL = "wtx-test@example.com";
});

function git(repoPath: string, command: string): string {
  return execSync(`git ${command}`, { cwd: repoPath, encoding: "utf8" }).trim();
}

function write(repoPath: string, filePath: string, content: string | Buffer): void {
  const fullPath = path.join(repoPath, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function createRepo(): string {
  const repoPath = createTempDir("wtx-changes-");
  git(repoPath, "init -q -b main .");
  git(repoPath, 'config user.name "Test User"');
  git(repoPath, 'config user.email "test@example.com"');
  write(repoPath, "tracked.txt", "one\ntwo\n");
  write(repoPath, "staged.txt", "base\n");
  git(repoPath, "add .");
  git(repoPath, 'commit -q -m init');
  git(repoPath, "checkout -q -b feature");
  return repoPath;
}

describe("changes", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = createRepo();
  });

  it("returns empty results for a clean worktree", async () => {
    await expect(getChangedFiles({ repoPath, branch: "feature", scope: "worktree" })).resolves.toEqual([]);

    const diff = await getFileDiff({ repoPath, branch: "feature", scope: "worktree", filePath: "tracked.txt" });
    expect(diff).toMatchObject({ path: "tracked.txt", binary: false, diff: "", truncated: false });
  });

  it("reports unstaged worktree changes and lazily loads a single file diff", async () => {
    write(repoPath, "tracked.txt", "one\ntwo changed\nthree\n");

    const files = await getChangedFiles({ repoPath, branch: "feature", scope: "worktree" });
    expect(files).toEqual([{ path: "tracked.txt", status: "M", added: 2, removed: 1, binary: false }]);

    const diff = await getFileDiff({ repoPath, branch: "feature", scope: "worktree", filePath: "tracked.txt" });
    expect(diff.binary).toBe(false);
    expect(diff.truncated).toBe(false);
    expect(diff.diff).toContain("diff --git a/tracked.txt b/tracked.txt");
    expect(diff.diff).toContain("+two changed");
  });

  it("reports staged changes separately from unstaged changes", async () => {
    write(repoPath, "staged.txt", "base\nstaged\n");
    git(repoPath, "add staged.txt");
    write(repoPath, "tracked.txt", "one\nunstaged\n");

    const staged = await getChangedFiles({ repoPath, branch: "feature", scope: "staged" });
    const worktree = await getChangedFiles({ repoPath, branch: "feature", scope: "worktree" });

    expect(staged.map((file) => file.path)).toEqual(["staged.txt"]);
    expect(worktree.map((file) => file.path)).toEqual(["tracked.txt"]);
  });

  it("diffs HEAD against the recorded stack base for base scope", async () => {
    git(repoPath, "checkout -q main");
    write(repoPath, "base-only.txt", "base\n");
    git(repoPath, "add base-only.txt");
    git(repoPath, 'commit -q -m "base branch"');
    git(repoPath, "checkout -q feature");
    git(repoPath, "checkout -q -b parent main");
    const baseSha = git(repoPath, "rev-parse HEAD");
    await recordStackEntry(repoPath, "feature", {
      baseRef: "parent",
      baseSha,
      explicit: true,
      createdAt: new Date().toISOString(),
    }, opts);
    git(repoPath, "checkout -q feature");
    write(repoPath, "feature.txt", "feature\n");
    git(repoPath, "add feature.txt");
    git(repoPath, 'commit -q -m "feature work"');

    const files = await getChangedFiles({ repoPath, branch: "feature", scope: "base" });

    expect(files.map((file) => file.path)).toEqual(["feature.txt"]);
  });

  it("flags binary files and omits the diff body", async () => {
    write(repoPath, "image.bin", Buffer.from([0, 1, 2, 3, 0, 4]));
    git(repoPath, "add image.bin");

    const files = await getChangedFiles({ repoPath, branch: "feature", scope: "staged" });
    const binary = files.find((file) => file.path === "image.bin");
    expect(binary).toMatchObject({ added: 0, removed: 0, binary: true });

    const diff = await getFileDiff({ repoPath, branch: "feature", scope: "staged", filePath: "image.bin" });
    expect(diff).toMatchObject({ path: "image.bin", binary: true, diff: "", truncated: false });
  });

  it("truncates large single-file diffs", async () => {
    const original = Array.from({ length: 520 }, (_, index) => `line ${index}`).join("\n");
    const changed = Array.from({ length: 520 }, (_, index) => `changed ${index}`).join("\n");
    write(repoPath, "large.txt", `${original}\n`);
    git(repoPath, "add large.txt");
    git(repoPath, 'commit -q -m "add large"');
    write(repoPath, "large.txt", `${changed}\n`);

    const diff = await getFileDiff({ repoPath, branch: "feature", scope: "worktree", filePath: "large.txt" });

    expect(diff.truncated).toBe(true);
    expect(diff.diff.split("\n")).toHaveLength(501);
    expect(diff.diff).toMatch(/\[\.\.\. \d+ more lines truncated \.\.\.\]$/);
  });

  it("invalidates cached data when HEAD changes", async () => {
    write(repoPath, "cached.txt", "first\n");
    git(repoPath, "add cached.txt");
    git(repoPath, 'commit -q -m "first"');
    const first = await getChangedFiles({ repoPath, branch: "feature", scope: "base" });

    write(repoPath, "second.txt", "second\n");
    git(repoPath, "add second.txt");
    git(repoPath, 'commit -q -m "second"');
    const second = await getChangedFiles({ repoPath, branch: "feature", scope: "base" });

    expect(first.map((file) => file.path)).toEqual(["cached.txt"]);
    expect(second.map((file) => file.path).sort()).toEqual(["cached.txt", "second.txt"]);
  });

  it("does not mutate staged or unstaged changes", async () => {
    write(repoPath, "staged.txt", "base\nstaged\n");
    git(repoPath, "add staged.txt");
    write(repoPath, "tracked.txt", "one\nworktree\n");
    const before = git(repoPath, "status --porcelain");

    await getChangedFiles({ repoPath, branch: "feature", scope: "staged" });
    await getChangedFiles({ repoPath, branch: "feature", scope: "worktree" });
    await getFileDiff({ repoPath, branch: "feature", scope: "staged", filePath: "staged.txt" });
    await getFileDiff({ repoPath, branch: "feature", scope: "worktree", filePath: "tracked.txt" });
    const after = git(repoPath, "status --porcelain");

    expect(after).toBe(before);
  });
});
