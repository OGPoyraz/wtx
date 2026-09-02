import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { loadConfig, saveConfig } from "../src/lib/config.js";
import type { RepoConfig } from "../src/types.js";
import { createTempConfig, createTempDir } from "./setup.js";
import * as log from "../src/lib/log.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

const minimalRepoConfig: RepoConfig = {
  main_branch: "auto",
  fetch_main_on_create: true,
  install_script: null,
  check_prs: true,
  forge_provider: "auto",
  pr_lookup_repo: null,
  deps: { manager: "auto", strategy: "auto" },
};

vi.mock("../src/lib/log.js", () => ({
  stepProgress: vi.fn(),
  stepWarning: vi.fn(),
}));

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a valid config successfully", () => {
    const { config } = createTempConfig();
    const loaded = loadConfig();
    expect(loaded.version).toBe(2);
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
    expect(() => loadConfig()).toThrow('"version": 2');
  });

  it("loads a minimal v1 config fixture through v2 migration", () => {
    const dir = createTempDir("wtx-v1-minimal-config-");
    const configDir = path.join(dir, "wtx");
    fs.mkdirSync(configDir, { recursive: true });
    fs.copyFileSync(
      path.join(testDir, "fixtures", "config-v1-minimal.json"),
      path.join(configDir, "config.json")
    );
    process.env.XDG_CONFIG_HOME = dir;

    const loaded = loadConfig();
    expect(loaded).toMatchObject({
      version: 2,
      root: path.join(os.homedir(), "Repos"),
      postfix: "-wt",
      ide: "cursor",
      default_main_branch: "main",
      user: null,
      repos: {},
      favorites: [],
      workspace_root: null,
      ports: { min: 4100, max: 4999 },
      tui: {
        leftPaneWidthWeight: 3,
        rightPaneWidthWeight: 7,
        theme: "tokyonight",
        custom_theme: null,
      },
    });
    expect(log.stepProgress).toHaveBeenCalledWith("migrated config to v2");
  });

  it("loads a full v1 config fixture and preserves values through migration", () => {
    const dir = createTempDir("wtx-v1-full-config-");
    const configDir = path.join(dir, "wtx");
    fs.mkdirSync(configDir, { recursive: true });
    fs.copyFileSync(
      path.join(testDir, "fixtures", "config-v1-full.json"),
      path.join(configDir, "config.json")
    );
    process.env.XDG_CONFIG_HOME = dir;

    const loaded = loadConfig();
    const repo = loaded.repos["legacy-repo"]!;
    expect(loaded.version).toBe(2);
    expect(loaded.root).toBe(path.join(os.homedir(), "Repos"));
    expect(loaded.postfix).toBe("-custom-wt");
    expect(loaded.ide).toBe("code");
    expect(loaded.default_main_branch).toBe("trunk");
    expect(loaded.user).toBe("ogp");
    expect(loaded.ports).toEqual({ min: 4200, max: 4300 });
    expect(loaded.agents).toEqual({
      claude: { command: "claude --continue" },
      review_bot: { command: "opencode --model test" },
    });
    expect(repo).toMatchObject({
      main_branch: "develop",
      fetch_main_on_create: false,
      sync_files: [".env", ".env.local"],
      post_create: ["bun install"],
      post_sync: ["bun run sync"],
      install_script: "bun install --frozen-lockfile",
      check_prs: false,
      forge_provider: "github",
      pr_lookup_repo: "upstream/legacy-repo",
      deps: { manager: "bun", strategy: "install" },
    });
    expect((repo as Record<string, unknown>).pr).toBeUndefined();
    expect((repo as Record<string, unknown>).forge).toBeUndefined();
    expect((repo as Record<string, unknown>).pr_repo).toBeUndefined();
    expect(loaded.favorites).toEqual([]);
    expect(loaded.workspace_root).toBeNull();
    expect(loaded.tui).toEqual({
      leftPaneWidthWeight: 4,
      rightPaneWidthWeight: 6,
      theme: "tokyonight",
      custom_theme: null,
    });
    expect(log.stepProgress).toHaveBeenCalledWith("migrated config to v2");
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
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({
      version: 2,
      root: "/tmp",
      repos: {
        "legacy-repo": { main_branch: "auto", pr: false, forge: "github", pr_repo: "owner/name" }
      }
    }), "utf-8");

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
        "missing-repo": minimalRepoConfig
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
        "nested-repo": minimalRepoConfig
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
        "unknown-repo": minimalRepoConfig
      }
    });
    
    const loaded = loadConfig();
    expect(loaded.repos["unknown-repo"]).toBeDefined();
    expect(log.stepWarning).toHaveBeenCalledWith(
      expect.stringContaining("unknown-repo main checkout directory does not exist at")
    );
  });
});
