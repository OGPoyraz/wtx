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
  workspaceRoot: string;
  configPath: string;
}

function makeConfig(root: string, workspaceRoot: string, repos: string[]): Config {
  const repoConfigs: Config["repos"] = {};
  for (const name of repos) {
    repoConfigs[name] = {
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
    };
  }
  return {
    version: 2,
    root,
    postfix: "-wt",
    ide: "cursor",
    default_main_branch: "main",
    user: null,
    repos: repoConfigs,
    favorites: [],
    workspace_root: workspaceRoot,
    ports: { min: 4100, max: 4999 },
    tui: { leftPaneWidthWeight: 3, rightPaneWidthWeight: 7, theme: "tokyonight", custom_theme: null },
  };
}

function setupRepo(root: string, name: string): void {
  const mainPath = path.join(root, name);
  fs.mkdirSync(mainPath, { recursive: true });
  execSync("git init -q", { cwd: mainPath });
  execSync('git config user.name "Test"', { cwd: mainPath });
  execSync('git config user.email "test@example.com"', { cwd: mainPath });
  execSync('git commit --allow-empty -q -m init', { cwd: mainPath });
}

function createWorktreeFor(env: Env, repo: string, branch: string): string {
  const mainPath = path.join(env.root, repo);
  const wtPath = path.join(env.root, `${repo}-wt`, branch);
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  execSync(`git worktree add -q -b ${branch} ${wtPath}`, { cwd: mainPath });
  return wtPath;
}

function setup(): Env {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wtx-ws-cli-")));
  const configDir = path.join(tmpDir, "cfg");
  const root = path.join(tmpDir, "repos");
  const workspaceRoot = path.join(tmpDir, "workspaces");
  fs.mkdirSync(path.join(configDir, "wtx"), { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });

  setupRepo(root, "alpha");
  setupRepo(root, "beta");

  const cfg = makeConfig(root, workspaceRoot, ["alpha", "beta"]);
  const configPath = path.join(configDir, "wtx", "config.json");
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

  return { tmpDir, configDir, root, workspaceRoot, configPath };
}

function runCli(env: Env, args: string[], opts: { input?: string; extraEnv?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(BUN, ["run", CLI, ...args], {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: env.configDir,
      WTX_NO_WIZARD: "1",
      WTX_YES: "0",
      NO_COLOR: "1",
      ...(opts.extraEnv ?? {}),
    },
    input: opts.input,
    encoding: "utf8",
  });
}

describe("wtx workspace CLI", () => {
  let env: Env;

  beforeEach(() => {
    env = setup();
  });

  afterEach(() => {
    fs.rmSync(env.tmpDir, { recursive: true, force: true });
  });

  it("create → ls → verify → rm → remove lifecycle preserves member worktrees", async () => {
    const wtAlpha = createWorktreeFor(env, "alpha", "feat/x");
    const wtBeta = createWorktreeFor(env, "beta", "feat/x");

    const create = runCli(env, ["workspace", "create", "demo", "--repo", "alpha,beta", "--branch", "feat/x"]);
    expect(create.status).toBe(0);

    const wsPath = path.join(env.workspaceRoot, "demo");
    expect(fs.existsSync(wsPath)).toBe(true);
    expect(fs.existsSync(path.join(wsPath, ".wtx-workspace.json"))).toBe(true);
    expect(fs.realpathSync(path.join(wsPath, "alpha"))).toBe(fs.realpathSync(wtAlpha));
    expect(fs.realpathSync(path.join(wsPath, "beta"))).toBe(fs.realpathSync(wtBeta));

    const lsJson = runCli(env, ["workspace", "ls", "--json"]);
    expect(lsJson.status).toBe(0);
    const parsed = JSON.parse(lsJson.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("demo");
    expect(parsed[0].members).toHaveLength(2);

    const verify = runCli(env, ["workspace", "verify", "demo"]);
    expect(verify.status).toBe(0);

    const rm = runCli(env, ["workspace", "rm", "demo", "alpha", "feat/x"]);
    expect(rm.status).toBe(0);
    expect(fs.existsSync(path.join(wsPath, "alpha"))).toBe(false);
    expect(fs.existsSync(wtAlpha)).toBe(true);

    const remove = runCli(env, ["workspace", "remove", "demo", "--yes"]);
    expect(remove.status).toBe(0);
    expect(fs.existsSync(wsPath)).toBe(false);
    expect(fs.existsSync(wtAlpha)).toBe(true);
    expect(fs.existsSync(wtBeta)).toBe(true);
  }, 30000);

  it("verify exits 1 and names broken members when a worktree is deleted", async () => {
    const wtAlpha = createWorktreeFor(env, "alpha", "feat/y");
    createWorktreeFor(env, "beta", "feat/y");

    const create = runCli(env, ["workspace", "create", "brk", "--repo", "alpha,beta", "--branch", "feat/y"]);
    expect(create.status).toBe(0);

    fs.rmSync(wtAlpha, { recursive: true, force: true });

    const verify = runCli(env, ["workspace", "verify", "brk"]);
    expect(verify.status).toBe(1);
    expect(verify.stdout + verify.stderr).toContain("alpha");
  }, 30000);

  it("dry-run does not create the workspace directory", async () => {
    createWorktreeFor(env, "alpha", "feat/z");

    const before = fs.readdirSync(env.workspaceRoot);
    const dry = runCli(env, ["workspace", "create", "dry", "--repo", "alpha", "--branch", "feat/z", "--dry-run"]);
    expect(dry.status).toBe(0);
    const after = fs.readdirSync(env.workspaceRoot);
    expect(after).toEqual(before);
    expect(fs.existsSync(path.join(env.workspaceRoot, "dry"))).toBe(false);
  }, 30000);

  it("workspace remove refuses to proceed without --yes on non-interactive stdin", async () => {
    createWorktreeFor(env, "alpha", "feat/w");
    const create = runCli(env, ["workspace", "create", "ni", "--repo", "alpha", "--branch", "feat/w"]);
    expect(create.status).toBe(0);

    const remove = runCli(env, ["workspace", "remove", "ni"]);
    expect(remove.status).toBe(1);
    expect(fs.existsSync(path.join(env.workspaceRoot, "ni"))).toBe(true);
  }, 30000);

  it("add links a new member and rm unlinks it without touching the worktree", async () => {
    createWorktreeFor(env, "alpha", "feat/q");
    const wtBeta = createWorktreeFor(env, "beta", "feat/q");

    const create = runCli(env, ["workspace", "create", "team", "--repo", "alpha", "--branch", "feat/q"]);
    expect(create.status).toBe(0);

    const add = runCli(env, ["workspace", "add", "team", "beta", "feat/q"]);
    expect(add.status).toBe(0);
    expect(fs.realpathSync(path.join(env.workspaceRoot, "team", "beta"))).toBe(fs.realpathSync(wtBeta));

    const rm = runCli(env, ["workspace", "rm", "team", "beta", "feat/q"]);
    expect(rm.status).toBe(0);
    expect(fs.existsSync(path.join(env.workspaceRoot, "team", "beta"))).toBe(false);
    expect(fs.existsSync(wtBeta)).toBe(true);
  }, 30000);
});
