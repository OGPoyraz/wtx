import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import { 
  parseRepoFlag, 
  resolveRepos, 
  getWorktreePath, 
  detectRepoFromCwd,
  findWorktreeForBranch
} from "../src/lib/resolver.js";
import type { Worktree } from "../src/lib/git.js";
import { createTempConfig, createTempDir, createTempGitRepo } from "./setup.js";
import type { Config, RepoContext } from "../src/types.js";

describe("resolver", () => {
  let originalCwd: () => string;

  beforeEach(() => {
    originalCwd = process.cwd;
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe("parseRepoFlag", () => {
    it("parses comma-separated values", () => {
      expect(parseRepoFlag(["repo1,repo2", "repo3"])).toEqual(["repo1", "repo2", "repo3"]);
    });

    it("deduplicates repeated values", () => {
      expect(parseRepoFlag(["repo1", "repo1,repo2"])).toEqual(["repo1", "repo2"]);
    });

    it("returns undefined for undefined or empty input", () => {
      expect(parseRepoFlag(undefined)).toBeUndefined();
      expect(parseRepoFlag([])).toBeUndefined();
    });
  });

  describe("resolveRepos", () => {
    it("returns all repos when no filter is applied and not inside any repo", () => {
      const root = createTempDir("wtx-resolver-root-");
      process.cwd = () => root;
      
      const repo1Path = createTempGitRepo("repo1");
      const repo2Path = createTempGitRepo("repo2");
      
      const fs = require("fs");
      fs.renameSync(repo1Path, path.join(root, "repo1"));
      fs.renameSync(repo2Path, path.join(root, "repo2"));
      
      const config: Config = {
        version: 1,
        root,
        postfix: "-wt",
        ide: "cursor",
        default_main_branch: "main",
        repos: {
          repo1: { main_branch: "auto" },
          repo2: { main_branch: "auto" }
        }
      };

      const result = resolveRepos(config);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual(["repo1", "repo2"]);
    });

    it("filters correctly when filter is provided", () => {
      const root = createTempDir("wtx-resolver-root-");
      process.cwd = () => root;
      
      const fs = require("fs");
      fs.mkdirSync(path.join(root, "repo1"));
      fs.mkdirSync(path.join(root, "repo1", ".git"));
      fs.mkdirSync(path.join(root, "repo2"));
      fs.mkdirSync(path.join(root, "repo2", ".git"));
      
      const config: Config = {
        version: 1,
        root,
        postfix: "-wt",
        ide: "cursor",
        default_main_branch: "main",
        repos: {
          repo1: { main_branch: "auto" },
          repo2: { main_branch: "auto" }
        }
      };

      const result = resolveRepos(config, ["repo1"]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("repo1");
    });

    it("throws on unknown repo name", () => {
      const config: Config = {
        version: 1,
        root: "/tmp",
        postfix: "-wt",
        ide: "cursor",
        default_main_branch: "main",
        repos: {
          repo1: { main_branch: "auto" }
        }
      };

      expect(() => resolveRepos(config, ["repo2"])).toThrow("not found in config");
    });
  });

  describe("getWorktreePath", () => {
    it("computes correct path", () => {
      const repoCtx: RepoContext = {
        name: "repo1",
        mainPath: "/root/repo1",
        wtRoot: "/root/repo1-wt",
        config: { main_branch: "auto" }
      };

      expect(getWorktreePath(repoCtx, "feature")).toBe("/root/repo1-wt/feature");
    });
  });

  describe("detectRepoFromCwd", () => {
    it("returns correct repo when cwd is inside main checkout", () => {
      const config: Config = {
        version: 1,
        root: "/root",
        postfix: "-wt",
        ide: "cursor",
        default_main_branch: "main",
        repos: {
          repo1: { main_branch: "auto" }
        }
      };

      process.cwd = () => "/root/repo1/src/components";
      expect(detectRepoFromCwd(config)).toBe("repo1");
      
      process.cwd = () => "/root/repo1";
      expect(detectRepoFromCwd(config)).toBe("repo1");
    });

    it("returns correct repo when cwd is inside worktree dir", () => {
      const config: Config = {
        version: 1,
        root: "/root",
        postfix: "-wt",
        ide: "cursor",
        default_main_branch: "main",
        repos: {
          repo1: { main_branch: "auto" }
        }
      };

      process.cwd = () => "/root/repo1-wt/feature/src";
      expect(detectRepoFromCwd(config)).toBe("repo1");
      
      process.cwd = () => "/root/repo1-wt";
      expect(detectRepoFromCwd(config)).toBe("repo1");
    });

    it("returns undefined when cwd is outside all repos", () => {
      const config: Config = {
        version: 1,
        root: "/root",
        postfix: "-wt",
        ide: "cursor",
        default_main_branch: "main",
        repos: {
          repo1: { main_branch: "auto" }
        }
      };

      process.cwd = () => "/root/other-repo";
      expect(detectRepoFromCwd(config)).toBeUndefined();
      
      process.cwd = () => "/home/user";
      expect(detectRepoFromCwd(config)).toBeUndefined();
    });
  });
});

describe("findWorktreeForBranch", () => {
  const MAIN_PATH = "/repos/wtx";

  function makeWt(partial: Partial<Worktree>): Worktree {
    return {
      path: "/repos/wtx-wt/branch",
      branch: "branch",
      commit: "abc1234",
      isLocked: false,
      isPrunable: false,
      isBare: false,
      ...partial,
    };
  }

  it("finds a worktree whose directory no longer matches the branch name", () => {
    const worktrees = [
      makeWt({ path: MAIN_PATH, branch: "main" }),
      makeWt({ path: "/repos/wtx-wt/feat/next", branch: "fix/m1-safety" }),
    ];

    const target = findWorktreeForBranch(
      worktrees,
      "fix/m1-safety",
      MAIN_PATH,
      "/repos/wtx-wt/fix/m1-safety"
    );

    expect(target?.path).toBe("/repos/wtx-wt/feat/next");
  });

  it("falls back to the expected path when the worktree has no branch (detached)", () => {
    const worktrees = [
      makeWt({ path: MAIN_PATH, branch: "main" }),
      makeWt({ path: "/repos/wtx-wt/detached", branch: undefined }),
    ];

    const target = findWorktreeForBranch(
      worktrees,
      "detached",
      MAIN_PATH,
      "/repos/wtx-wt/detached"
    );

    expect(target?.path).toBe("/repos/wtx-wt/detached");
  });

  it("never resolves the main checkout, even when its branch matches", () => {
    const worktrees = [makeWt({ path: MAIN_PATH, branch: "main" })];

    expect(
      findWorktreeForBranch(worktrees, "main", MAIN_PATH, "/repos/wtx-wt/main")
    ).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    const worktrees = [
      makeWt({ path: MAIN_PATH, branch: "main" }),
      makeWt({ path: "/repos/wtx-wt/feat/a", branch: "feat/a" }),
    ];

    expect(
      findWorktreeForBranch(worktrees, "feat/b", MAIN_PATH, "/repos/wtx-wt/feat/b")
    ).toBeUndefined();
  });
});
