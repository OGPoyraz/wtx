import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { Config } from "../src/types.js";
import { afterEach } from "vitest";

const tempDirs: Set<string> = new Set();
const originalEnv = { ...process.env };

export function createTempDir(prefix = "wtx-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

export function createTempGitRepo(name = "repo"): string {
  const dir = createTempDir(`wtx-test-repo-${name}-`);
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: "ignore" });
  execSync('git commit --allow-empty -m "Initial commit"', { cwd: dir, stdio: "ignore" });
  return dir;
}

export function createTempConfig(overrides?: Partial<Config>): { config: Config; path: string; dir: string } {
  const dir = createTempDir("wtx-test-config-");
  const configDir = path.join(dir, "wtx");
  fs.mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, "config.json");
  
  const config: Config = {
    version: 1,
    root: os.tmpdir(),
    postfix: "-wt",
    ide: "cursor",
    default_main_branch: "main",
    repos: {},
    ...overrides
  };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  
  process.env.XDG_CONFIG_HOME = dir;
  
  return { config, path: configPath, dir };
}

export function cleanupTemp(): void {
  for (const dir of tempDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  tempDirs.clear();
  
  process.env = { ...originalEnv };
}

afterEach(() => {
  cleanupTemp();
});
