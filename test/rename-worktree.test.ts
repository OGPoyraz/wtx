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
  fs.writeFileSync(path.join(wtRoot, "feat/old", "a.txt"), "tracked modified");
  fs.writeFileSync(path.join(wtRoot, "feat/old", "c.txt"), "staged work");
  git(path.join(wtRoot, "feat/old"), "add c.txt");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function repoCtx(config: Partial<RepoContext["config"]> = {}): RepoContext {
  return { name: "myrepo", mainPath, wtRoot, config: config as RepoContext["config"] };
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
    expect(outcome.dirtyFiles.some((l) => l.includes("b.txt"))).toBe(true);
    expect(outcome.dirtyFiles.some((l) => l.includes("a.txt"))).toBe(true);
    expect(outcome.dirtyFiles.some((l) => l.includes("c.txt"))).toBe(true);
    expect(outcome.lostDirtyFiles).toEqual([]);
    expect(fs.readFileSync(path.join(newPath, "a.txt"), "utf8")).toBe("tracked modified");
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

describe("renameWorktree sync files", () => {
  it("re-syncs clean tracked sync files from main after the move", async () => {
    const wtPath = path.join(wtRoot, "sync/clean");
    git(mainPath, `worktree add -b sync/clean ${wtPath} main`);
    fs.writeFileSync(path.join(wtPath, "shared.env"), "v1");
    git(wtPath, "add shared.env");
    git(wtPath, "commit -q -m env");

    fs.writeFileSync(path.join(mainPath, "shared.env"), "v2-from-main");

    const outcome = await renameWorktree({
      repo: repoCtx({ sync_files: ["shared.env"] }),
      oldBranch: "sync/clean",
      newBranch: "sync/clean2",
      opts,
    });

    expect(fs.readFileSync(path.join(wtRoot, "sync/clean2/shared.env"), "utf8")).toBe("v2-from-main");
    expect(outcome.resyncedFiles).toContain("shared.env");
    expect(outcome.keptLocalSyncFiles).not.toContain("shared.env");
  });

  it("keeps locally modified sync files instead of overwriting them", async () => {
    const wtPath = path.join(wtRoot, "sync/dirty");
    git(mainPath, `worktree add -b sync/dirty ${wtPath} main`);
    fs.writeFileSync(path.join(wtPath, "local.env"), "base");
    git(wtPath, "add local.env");
    git(wtPath, "commit -q -m env");

    fs.writeFileSync(path.join(mainPath, "local.env"), "from-main");
    fs.writeFileSync(path.join(wtPath, "local.env"), "local edit");

    const outcome = await renameWorktree({
      repo: repoCtx({ sync_files: ["local.env"] }),
      oldBranch: "sync/dirty",
      newBranch: "sync/dirty2",
      opts,
    });

    expect(fs.readFileSync(path.join(wtRoot, "sync/dirty2/local.env"), "utf8")).toBe("local edit");
    expect(outcome.keptLocalSyncFiles).toContain("local.env");
    expect(outcome.resyncedFiles).not.toContain("local.env");
  });

  it("keeps untracked sync files rather than clobbering them", async () => {
    const wtPath = path.join(wtRoot, "sync/untracked");
    git(mainPath, `worktree add -b sync/untracked ${wtPath} main`);

    fs.writeFileSync(path.join(mainPath, "u.env"), "main-secret");
    fs.writeFileSync(path.join(wtPath, "u.env"), "worktree-secret");

    const outcome = await renameWorktree({
      repo: repoCtx({ sync_files: ["u.env"] }),
      oldBranch: "sync/untracked",
      newBranch: "sync/untracked2",
      opts,
    });

    expect(fs.readFileSync(path.join(wtRoot, "sync/untracked2/u.env"), "utf8")).toBe("worktree-secret");
    expect(outcome.keptLocalSyncFiles).toContain("u.env");
  });

  it("keeps ignored sync files rather than clobbering them", async () => {
    const wtPath = path.join(wtRoot, "sync/ignored");
    git(mainPath, `worktree add -b sync/ignored ${wtPath} main`);
    fs.writeFileSync(path.join(wtPath, ".gitignore"), ".env\n");
    git(wtPath, "add .gitignore");
    git(wtPath, "commit -q -m ignore-env");

    fs.writeFileSync(path.join(mainPath, "secret.env"), "main-secret");
    fs.writeFileSync(path.join(wtPath, "secret.env"), "worktree-secret");

    const outcome = await renameWorktree({
      repo: repoCtx({ sync_files: ["secret.env"] }),
      oldBranch: "sync/ignored",
      newBranch: "sync/ignored2",
      opts,
    });

    expect(fs.readFileSync(path.join(wtRoot, "sync/ignored2/secret.env"), "utf8")).toBe("worktree-secret");
    expect(outcome.keptLocalSyncFiles).toContain("secret.env");
  });

  it("copies sync files that are missing from the worktree", async () => {
    const wtPath = path.join(wtRoot, "sync/missing");
    git(mainPath, `worktree add -b sync/missing ${wtPath} main`);

    fs.writeFileSync(path.join(mainPath, "fresh.env"), "fresh-content");

    const outcome = await renameWorktree({
      repo: repoCtx({ sync_files: ["fresh.env"] }),
      oldBranch: "sync/missing",
      newBranch: "sync/missing2",
      opts,
    });

    expect(fs.readFileSync(path.join(wtRoot, "sync/missing2/fresh.env"), "utf8")).toBe("fresh-content");
    expect(outcome.resyncedFiles).toContain("fresh.env");
  });
});
