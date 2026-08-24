import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { loadConfig, saveConfig } from "../src/lib/config.js";
import { createTempConfig, createTempDir } from "./setup.js";
import * as log from "../src/lib/log.js";

vi.mock("../src/lib/log.js", () => ({
  stepWarning: vi.fn(),
}));

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a valid config successfully", () => {
    const { config } = createTempConfig();
    const loaded = loadConfig();
    expect(loaded.version).toBe(1);
    expect(loaded.root).toBe(config.root);
  });

  it("expands tilde in root to homedir", () => {
    createTempConfig({ root: "~/test-root" });
    const loaded = loadConfig();
    expect(loaded.root).toBe(path.join(os.homedir(), "test-root"));
  });

  it("saves config atomically", () => {
    const { config, path: configPath } = createTempConfig();
    config.ide = "vscode";
    saveConfig(config);
    
    expect(fs.existsSync(configPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(content.ide).toBe("vscode");
  });

  it("throws with helpful message and remediation when config is missing", () => {
    const dir = createTempDir("wtx-missing-config-");
    process.env.XDG_CONFIG_HOME = dir;
    
    expect(() => loadConfig()).toThrow("Config file not found at");
    expect(() => loadConfig()).toThrow("Run 'wtx config init' to create one interactively");
    expect(() => loadConfig()).toThrow('"version": 1');
  });

  it("throws when config is invalid JSON", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, "{ invalid json", "utf-8");
    
    expect(() => loadConfig()).toThrow("Failed to parse config file at");
  });

  it("throws when config schema is invalid (empty root)", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, root: "   ", postfix: "-wt", ide: "cursor", default_main_branch: "main", repos: {} }), "utf-8");
    expect(() => loadConfig()).toThrow("root invalid because must not be empty");
  });

  it("throws when postfix contains path separators", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, root: "/tmp", postfix: "/-wt", ide: "cursor", default_main_branch: "main", repos: {} }), "utf-8");
    expect(() => loadConfig()).toThrow("postfix invalid because must not contain path separators");
  });

  it("throws when ide is empty", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, root: "/tmp", postfix: "-wt", ide: "", default_main_branch: "main", repos: {} }), "utf-8");
    expect(() => loadConfig()).toThrow("ide invalid because must not be empty");
  });

  it("throws when repo key format is invalid", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({ 
      version: 1, root: "/tmp", postfix: "-wt", ide: "cursor", default_main_branch: "main", 
      repos: { "-invalid": { main_branch: "auto" } } 
    }), "utf-8");
    expect(() => loadConfig()).toThrow("repos.-invalid invalid because Invalid repo key format");
  });

  it("throws when root is unexpandable to absolute path", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, root: "relative/path", postfix: "-wt", ide: "cursor", default_main_branch: "main", repos: {} }), "utf-8");
    expect(() => loadConfig()).toThrow("root invalid because must be an absolute path after tilde expansion");
  });

  it("migrates legacy repo keys (pr, forge, pr_repo) to new names", () => {
    const { path: configPath } = createTempConfig({
      repos: {
        "legacy-repo": { main_branch: "auto", pr: false, forge: "github", pr_repo: "owner/name" }
      }
    });

    const loaded = loadConfig();
    const repo = loaded.repos["legacy-repo"]!;
    expect(repo.check_prs).toBe(false);
    expect(repo.forge_provider).toBe("github");
    expect(repo.pr_lookup_repo).toBe("owner/name");
    expect((repo as Record<string, unknown>).pr).toBeUndefined();

    saveConfig(loaded);
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const savedRepo = raw.repos["legacy-repo"];
    expect(savedRepo.pr).toBeUndefined();
    expect(savedRepo.forge).toBeUndefined();
    expect(savedRepo.pr_repo).toBeUndefined();
    expect(savedRepo.check_prs).toBe(false);
  });

  it("warns when main checkout directory does not exist", () => {
    const root = createTempDir("wtx-fake-root-");
    createTempConfig({
      root,
      repos: {
        "missing-repo": { main_branch: "auto" }
      }
    });
    
    loadConfig();
    expect(log.stepWarning).toHaveBeenCalledWith(
      expect.stringContaining("missing-repo main checkout directory does not exist at")
    );
  });

  it("warns when wtRoot resolves inside main checkout", () => {
    const root = createTempDir("wtx-fake-root-");
    const repoPath = path.join(root, "nested-repo");
    fs.mkdirSync(repoPath);
    
    const wtRoot = path.join(root, "nested-repo-wt");
    const nestedWtRootTarget = path.join(repoPath, "wt");
    fs.mkdirSync(nestedWtRootTarget);
    fs.symlinkSync(nestedWtRootTarget, wtRoot, "dir");
    
    createTempConfig({
      root,
      postfix: "-wt",
      repos: {
        "nested-repo": { main_branch: "auto" }
      }
    });
    
    loadConfig();
    expect(log.stepWarning).toHaveBeenCalledWith(
      expect.stringContaining("Config for repo nested-repo creates a nesting issue")
    );
  });

  it("warns but doesn't error when config has unknown repo", () => {
    const root = createTempDir("wtx-fake-root-");
    createTempConfig({
      root,
      repos: {
        "unknown-repo": { main_branch: "auto" }
      }
    });
    
    const loaded = loadConfig();
    expect(loaded.repos["unknown-repo"]).toBeDefined();
    expect(log.stepWarning).toHaveBeenCalledWith(
      expect.stringContaining("unknown-repo main checkout directory does not exist at")
    );
  });
});
