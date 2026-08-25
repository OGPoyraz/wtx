import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { runPostCreateSetup, syncEntry } from "../src/lib/worktree-setup.js";
import type { Config, RepoContext, GlobalOptions } from "../src/types.js";

describe("runPostCreateSetup", () => {
  let tmpDir: string;
  let mainPath: string;
  let wtPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wtx-test-"));
    mainPath = path.join(tmpDir, "main");
    wtPath = path.join(tmpDir, "wt");
    fs.mkdirSync(mainPath);
    fs.mkdirSync(wtPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createParams(
    sync_files: string[] = [],
    post_create: string[] = [],
    dryRun = false
  ): Parameters<typeof runPostCreateSetup>[0] {
    const config: Config = {
      version: 1,
      root: tmpDir,
      postfix: "-wt",
      ide: "cursor",
      default_main_branch: "main",
      user: null,
      repos: {},
    };

    const repo: RepoContext = {
      name: "test-repo",
      mainPath,
      wtRoot: tmpDir,
      config: {
        main_branch: "main",
        fetch_main_on_create: true,
        sync_files,
        post_create,
        install_script: null,
        check_prs: true,
        forge_provider: "auto",
        pr_lookup_repo: null,
      },
    };

    const globalOpts: GlobalOptions = {
      verbose: false,
      dryRun,
    };

    return { config, repo, wtPath, branch: "feature", globalOpts };
  }

  it("handles empty config gracefully", async () => {
    const params = createParams();
    const result = await runPostCreateSetup(params);
    expect(result.copiedFiles).toEqual([]);
    expect(result.hooks).toEqual([]);
  });

  it("copies files and creates nested directories", async () => {
    const sync_files = ["config.json", "nested/deep/file.txt"];
    fs.writeFileSync(path.join(mainPath, "config.json"), "{}");
    fs.mkdirSync(path.join(mainPath, "nested/deep"), { recursive: true });
    fs.writeFileSync(path.join(mainPath, "nested/deep/file.txt"), "hello");

    const params = createParams(sync_files);
    const result = await runPostCreateSetup(params);

    expect(result.copiedFiles).toEqual(sync_files);
    expect(fs.existsSync(path.join(wtPath, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(wtPath, "nested/deep/file.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(wtPath, "nested/deep/file.txt"), "utf8")).toBe("hello");
  });

  it("copies directories recursively including nested content", async () => {
    const sync_files = [".js.env", "build/"];
    fs.writeFileSync(path.join(mainPath, ".js.env"), "KEY=value");
    fs.mkdirSync(path.join(mainPath, "build/assets"), { recursive: true });
    fs.writeFileSync(path.join(mainPath, "build/index.js"), "console.log(1)");
    fs.writeFileSync(path.join(mainPath, "build/assets/logo.svg"), "<svg/>");

    const params = createParams(sync_files);
    const result = await runPostCreateSetup(params);

    expect(result.copiedFiles).toEqual(sync_files);
    expect(fs.readFileSync(path.join(wtPath, ".js.env"), "utf8")).toBe("KEY=value");
    expect(fs.statSync(path.join(wtPath, "build")).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(wtPath, "build/index.js"), "utf8")).toBe("console.log(1)");
    expect(fs.readFileSync(path.join(wtPath, "build/assets/logo.svg"), "utf8")).toBe("<svg/>");
  });

  it("copies directories without trailing slash and overwrites on resync", () => {
    fs.mkdirSync(path.join(mainPath, "build/nested"), { recursive: true });
    fs.writeFileSync(path.join(mainPath, "build/out.txt"), "v2");

    expect(syncEntry(mainPath, wtPath, "build")).toBe(true);
    expect(fs.readFileSync(path.join(wtPath, "build/out.txt"), "utf8")).toBe("v2");

    fs.writeFileSync(path.join(mainPath, "build/out.txt"), "v3");
    expect(syncEntry(mainPath, wtPath, "build")).toBe(true);
    expect(fs.readFileSync(path.join(wtPath, "build/out.txt"), "utf8")).toBe("v3");
    expect(fs.statSync(path.join(wtPath, "build/nested")).isDirectory()).toBe(true);
  });

  it("returns false for missing entries without creating anything", () => {
    expect(syncEntry(mainPath, wtPath, "nope.txt")).toBe(false);
    expect(syncEntry(mainPath, wtPath, "nope-dir/")).toBe(false);
    expect(fs.existsSync(path.join(wtPath, "nope.txt"))).toBe(false);
    expect(fs.existsSync(path.join(wtPath, "nope-dir"))).toBe(false);
  });

  it("returns empty arrays on dry-run without copying or running hooks", async () => {
    const sync_files = ["file.txt"];
    fs.writeFileSync(path.join(mainPath, "file.txt"), "content");

    const params = createParams(sync_files, ["echo 'hello'"], true);
    const result = await runPostCreateSetup(params);

    expect(result.copiedFiles).toEqual([]);
    expect(result.hooks).toEqual([]);
    expect(fs.existsSync(path.join(wtPath, "file.txt"))).toBe(false);
  });

  it("collects successful hooks", async () => {
    const post_create = ["echo 'hello'", "exit 0"];
    const params = createParams([], post_create);
    const result = await runPostCreateSetup(params);

    expect(result.hooks).toHaveLength(2);
    expect(result.hooks[0]?.ok).toBe(true);
    expect(result.hooks[0]?.exitCode).toBe(0);
    expect(result.hooks[1]?.ok).toBe(true);
    expect(result.hooks[1]?.exitCode).toBe(0);
  });

  it("collects failing hooks with correct ok and exitCode status", async () => {
    const post_create = ["echo 'hello'", "exit 42", "echo 'world'"];
    const params = createParams([], post_create);
    const result = await runPostCreateSetup(params);

    expect(result.hooks).toHaveLength(3);
    
    expect(result.hooks[0]?.ok).toBe(true);
    expect(result.hooks[0]?.exitCode).toBe(0);
    
    expect(result.hooks[1]?.ok).toBe(false);
    expect(result.hooks[1]?.exitCode).toBe(42);
    expect(result.hooks[1]?.command).toBe("exit 42");
    
    expect(result.hooks[2]?.ok).toBe(true);
    expect(result.hooks[2]?.exitCode).toBe(0);
  });
});