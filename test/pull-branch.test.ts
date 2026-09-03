import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import type { Config } from "../src/types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "src", "index.ts");
const BUN = process.env.BUN_BIN ?? "bun";

interface Env {
  tmpDir: string;
  configDir: string;
  root: string;
  mainPath: string;
  bareOrigin: string;
  configPath: string;
}

function run(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: "ignore" });
}

function setup(): Env {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wtx-pull-cli-")));
  const configDir = path.join(tmpDir, "cfg");
  const root = path.join(tmpDir, "repos");
  const bareOrigin = path.join(tmpDir, "origin.git");
  const mainPath = path.join(root, "wtx");

  fs.mkdirSync(path.join(configDir, "wtx"), { recursive: true });
  fs.mkdirSync(root, { recursive: true });

  run(`git init -q --bare "${bareOrigin}"`, tmpDir);

  fs.mkdirSync(mainPath, { recursive: true });
  run("git init -q -b main .", mainPath);
  run('git config user.name "Test"', mainPath);
  run('git config user.email "test@example.com"', mainPath);
  run("git commit -q --allow-empty -m init", mainPath);
  run(`git remote add origin "${bareOrigin}"`, mainPath);
  run("git push -q -u origin main", mainPath);

  const repoConfig: Config["repos"][string] = {
    main_branch: "main",
    fetch_main_on_create: false,
    sync_files: [],
    post_create: [],
    post_sync: [],
    install_script: null,
    deps: { manager: "auto", strategy: "auto" },
    check_prs: false,
    forge_provider: "auto",
    pr_lookup_repo: null,
    workspace_root: null,
  };

  const cfg: Config = {
    version: 2,
    root,
    postfix: "-wt",
    ide: "cursor",
    default_main_branch: "main",
    user: null,
    repos: { wtx: repoConfig },
    favorites: [],
    workspace_root: null,
    ports: { min: 4100, max: 4999 },
    tui: { leftPaneWidthWeight: 3, rightPaneWidthWeight: 7, theme: "tokyonight", custom_theme: null },
  };

  const configPath = path.join(configDir, "wtx", "config.json");
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

  return { tmpDir, configDir, root, mainPath, bareOrigin, configPath };
}

function runCli(env: Env, args: string[], cwd: string = env.mainPath) {
  return spawnSync(BUN, ["run", CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: env.configDir,
      WTX_NO_WIZARD: "1",
      WTX_YES: "0",
      NO_COLOR: "1",
    },
    encoding: "utf8",
  });
}

function advanceOrigin(env: Env): string {
  const clonePath = path.join(env.tmpDir, "advance-clone");
  run(`git clone -q "${env.bareOrigin}" "${clonePath}"`, env.tmpDir);
  run('git config user.name "Test"', clonePath);
  run('git config user.email "test@example.com"', clonePath);
  run("git commit -q --allow-empty -m advance", clonePath);
  run("git push -q origin main", clonePath);
  const sha = execSync("git rev-parse HEAD", { cwd: clonePath, encoding: "utf8" }).trim();
  fs.rmSync(clonePath, { recursive: true, force: true });
  return sha;
}

describe("wtx pull-branch (main checkout)", () => {
  let env: Env;

  beforeEach(() => {
    env = setup();
  });

  afterEach(() => {
    fs.rmSync(env.tmpDir, { recursive: true, force: true });
  });

  it("fast-forwards the main checkout when the branch matches the repo's main branch", () => {
    const advancedSha = advanceOrigin(env);

    const result = runCli(env, ["pull-branch", "main", "--repo", "wtx"]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("No worktree found");

    const headSha = execSync("git rev-parse HEAD", { cwd: env.mainPath, encoding: "utf8" }).trim();
    expect(headSha).toBe(advancedSha);
  });

  it("auto-detects the branch from HEAD when run inside the main checkout", () => {
    const advancedSha = advanceOrigin(env);

    const result = runCli(env, ["pull-branch", "--repo", "wtx"]);
    expect(result.status).toBe(0);

    const headSha = execSync("git rev-parse HEAD", { cwd: env.mainPath, encoding: "utf8" }).trim();
    expect(headSha).toBe(advancedSha);
  });

  it("still pulls a regular (non-main) worktree branch", () => {
    run("git fetch -q origin", env.mainPath);
    const wtPath = path.join(env.root, "wtx-wt", "feat", "x");
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    run(`git worktree add -q -b feat/x "${wtPath}" origin/main`, env.mainPath);

    const advancedSha = advanceOrigin(env);

    const result = runCli(env, ["pull-branch", "feat/x", "--repo", "wtx"]);
    expect(result.status).toBe(0);

    const headSha = execSync("git rev-parse HEAD", { cwd: wtPath, encoding: "utf8" }).trim();
    expect(headSha).toBe(advancedSha);
  });
});
