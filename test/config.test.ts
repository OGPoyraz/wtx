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

  it("throws with helpful message when config is missing", () => {
    const dir = createTempDir("wtx-missing-config-");
    process.env.XDG_CONFIG_HOME = dir;
    
    expect(() => loadConfig()).toThrow("Config file not found at");
  });

  it("throws when config is invalid JSON", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, "{ invalid json", "utf-8");
    
    expect(() => loadConfig()).toThrow("Failed to parse config file at");
  });

  it("throws when config schema is invalid", () => {
    const { path: configPath } = createTempConfig();
    fs.writeFileSync(configPath, JSON.stringify({ root: "/tmp" }), "utf-8");
    
    expect(() => loadConfig()).toThrow("Invalid config format");
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
      expect.stringContaining("is missing .git directory at")
    );
  });
});
