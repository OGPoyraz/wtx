import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { planRename, renameWorktree } from "../src/lib/rename-worktree.js";
import type { RepoContext, GlobalOptions } from "../src/types.js";

let root: string;
let mainPath: string;
let wtRoot: string;

const opts: GlobalOptions = { verbose: false, dryRun: false };

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

beforeAll(() => {
  process.env.GIT_AUTHOR_NAME = "wtx-test";
  process.env.GIT_AUTHOR_EMAIL = "wtx-test@example.com";
  process.env.GIT_COMMITTER_NAME = "wtx-test";
  process.env.GIT_COMMITTER_EMAIL = "wtx-test@example.com";

  root = fs.mkdtempSync(path.join(os.tmpdir(), "wtx-rename-"));
  mainPath = path.join(root, "myrepo");
  wtRoot = path.join(root, "myrepo-wt");

  fs.mkdirSync(mainPath);
  git(mainPath, "init -q -b main");
  git(mainPath, 'config user.name "Test"');
  git(mainPath, 'config user.email "test@example.com"');
  fs.writeFileSync(path.join(mainPath, "a.txt"), "hello");
  git(mainPath, "add .");
  git(mainPath, 'commit -q -m init');

  fs.mkdirSync(wtRoot, { recursive: true });
  git(mainPath, `worktree add -b feat/old ${path.join(wtRoot, "feat/old")} main`);

  fs.writeFileSync(path.join(wtRoot, "feat/old", "b.txt"), "worktree file");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function repoCtx(): RepoContext {
  return { name: "myrepo", mainPath, wtRoot, config: {} as RepoContext["config"] };
}

describe("renameWorktree", () => {
  it("renames the branch and moves the checkout carrying uncommitted files", async () => {
    const outcome = await renameWorktree({
      repo: repoCtx(),
      oldBranch: "feat/old",
      newBranch: "feat/new",
      opts,
    });

    const newPath = path.join(wtRoot, "feat/new");
    expect(outcome.newPath).toBe(newPath);
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(path.join(wtRoot, "feat/old"))).toBe(false);

    const branches = git(mainPath, "branch --list");
    expect(branches).toContain("feat/new");
    expect(branches).not.toContain("feat/old");

    const worktreeList = git(mainPath, "worktree list --porcelain");
    expect(worktreeList).toContain(newPath);
    expect(worktreeList).toContain("feat/new");

    expect(fs.existsSync(path.join(newPath, "b.txt"))).toBe(true);
    expect(fs.existsSync(path.join(newPath, ".git"))).toBe(true);
    void outcome;
  });

  it("cleans up the emptied parent directory of the old location", async () => {
    git(mainPath, `worktree add -b nested/branch ${path.join(wtRoot, "nested/deep/branch")} main`);
    await renameWorktree({
      repo: repoCtx(),
      oldBranch: "nested/branch",
      newBranch: "nested/moved",
      opts,
    });

    expect(fs.existsSync(path.join(wtRoot, "nested/deep/branch"))).toBe(false);
    expect(fs.existsSync(path.join(wtRoot, "nested/deep"))).toBe(false);
    expect(fs.existsSync(path.join(wtRoot, "nested/moved"))).toBe(true);
  });

  it("throws when no worktree exists for the branch", async () => {
    await expect(
      renameWorktree({ repo: repoCtx(), oldBranch: "missing-branch", newBranch: "x/y", opts })
    ).rejects.toThrow("No worktree found");
  });

  it("throws when a local branch with the new name already exists", async () => {
    git(mainPath, "branch taken-name");
    await expect(
      renameWorktree({ repo: repoCtx(), oldBranch: "feat/new", newBranch: "taken-name", opts })
    ).rejects.toThrow("already exists");
  });

  it("dry run reports the plan without touching anything", async () => {
    const planned = await planRename(repoCtx(), "feat/new", "feat/next", { ...opts, dryRun: true });
    expect(planned.newPath).toBe(path.join(wtRoot, "feat/next"));
    expect(fs.existsSync(path.join(wtRoot, "feat/new"))).toBe(true);

    const branches = git(mainPath, "branch --list");
    expect(branches).not.toContain("feat/next");
  });
});
