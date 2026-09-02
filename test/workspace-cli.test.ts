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
  binDir: string;
  configPath: string;
}

function makeConfig(
  root: string,
  workspaceRoot: string,
  repos: string[],
  overrides: Partial<Record<string, Partial<Config["repos"][string]>>> = {}
): Config {
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
      workspace_root: workspaceRoot,
      ...(overrides[name] ?? {}),
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
  fs.writeFileSync(path.join(mainPath, ".env"), `${name}=env\n`);
  execSync("git add .env", { cwd: mainPath });
  execSync('git commit -q -m init', { cwd: mainPath });
  execSync("git branch -M main", { cwd: mainPath });
  execSync(`git remote add origin ${mainPath}`, { cwd: mainPath });
  execSync("git update-ref refs/remotes/origin/main HEAD", { cwd: mainPath });
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
  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(path.join(configDir, "wtx"), { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  setupRepo(root, "alpha");
  setupRepo(root, "beta");

  const cfg = makeConfig(root, workspaceRoot, ["alpha", "beta"]);
  const configPath = path.join(configDir, "wtx", "config.json");
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

  return { tmpDir, configDir, root, workspaceRoot, binDir, configPath };
}

function writeConfig(env: Env, config: Config): void {
  fs.writeFileSync(env.configPath, JSON.stringify(config, null, 2));
}

function runCli(env: Env, args: string[], opts: { input?: string; extraEnv?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(BUN, ["run", CLI, ...args], {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: env.configDir,
      WTX_NO_WIZARD: "1",
      WTX_YES: "0",
      NO_COLOR: "1",
      PATH: opts.extraEnv?.PATH ?? process.env.PATH ?? "",
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

  it("remove unlinks workspace members and keeps the workspace directory healthy", async () => {
    const wtAlpha = createWorktreeFor(env, "alpha", "feat/remove");
    createWorktreeFor(env, "beta", "feat/remove");

    const create = runCli(env, ["workspace", "create", "drop", "--repo", "alpha,beta", "--branch", "feat/remove"]);
    expect(create.status).toBe(0);

    const remove = runCli(env, ["remove", "feat/remove", "--yes"]);
    expect(remove.status).toBe(0);
    expect(remove.stdout).toContain('Unlinked from workspace "drop"');

    const wsPath = path.join(env.workspaceRoot, "drop");
    expect(fs.existsSync(wsPath)).toBe(true);
    expect(fs.existsSync(path.join(wsPath, "alpha"))).toBe(false);
    expect(fs.existsSync(wtAlpha)).toBe(false);

    const verify = runCli(env, ["workspace", "verify", "drop"]);
    expect(verify.status).toBe(0);
  }, 30000);

  it("prune unlinks each removed worktree from workspaces", async () => {
    createWorktreeFor(env, "alpha", "feat/prune");

    const cfg = makeConfig(env.root, env.workspaceRoot, ["alpha", "beta"], {
      alpha: { check_prs: true, forge_provider: "github" },
      beta: { check_prs: false },
    });
    writeConfig(env, cfg);
    execSync("git remote set-url origin git@github.com:example/alpha.git", { cwd: path.join(env.root, "alpha") });

    const create = runCli(env, ["workspace", "create", "prune-demo", "--repo", "alpha", "--branch", "feat/prune"]);
    expect(create.status).toBe(0);

    const gh = path.join(env.binDir, "gh");
    fs.writeFileSync(
      gh,
      "#!/bin/sh\nif [ \"$1\" = pr ] && [ \"$2\" = list ]; then\n  printf '%s' '[{\"number\":7,\"author\":null,\"title\":\"merged\",\"url\":\"https://github.com/example/alpha/pull/7\",\"state\":\"MERGED\",\"isDraft\":false,\"mergeable\":\"MERGEABLE\",\"statusCheckRollup\":null,\"reviewDecision\":null,\"headRefName\":\"feat/prune\",\"baseRefName\":\"main\",\"updatedAt\":\"2026-08-22T00:00:00Z\"}]'\nelse\n  echo unexpected gh invocation >&2\n  exit 1\nfi\n"
    );
    fs.chmodSync(gh, 0o755);

    const prune = runCli(env, ["prune", "--repo", "alpha", "--yes"], { extraEnv: { PATH: `${env.binDir}:${process.env.PATH ?? ""}` } });
    expect(prune.status).toBe(0);
    expect(prune.stdout).toContain('Unlinked from workspace "prune-demo"');

    const wsPath = path.join(env.workspaceRoot, "prune-demo");
    expect(fs.existsSync(wsPath)).toBe(true);
    expect(fs.existsSync(path.join(wsPath, "alpha"))).toBe(false);

    const verify = runCli(env, ["workspace", "verify", "prune-demo"]);
    expect(verify.status).toBe(0);
  }, 30000);

  it("rename updates workspace links and manifests to the new branch", async () => {
    const wtAlpha = createWorktreeFor(env, "alpha", "feat/old-name");

    const create = runCli(env, ["workspace", "create", "rename-demo", "--repo", "alpha", "--branch", "feat/old-name"]);
    expect(create.status).toBe(0);

    const rename = runCli(env, ["rename", "feat/old-name", "feat/new-name", "--repo", "alpha"]);
    expect(rename.status).toBe(0);
    expect(rename.stdout).toContain('Unlinked from workspace "rename-demo"');

    const wsPath = path.join(env.workspaceRoot, "rename-demo");
    const links = fs.readdirSync(wsPath).filter((entry) => fs.lstatSync(path.join(wsPath, entry)).isSymbolicLink());
    expect(links.length).toBe(1);
    expect(fs.realpathSync(path.join(wsPath, links[0]!))).toBe(fs.realpathSync(path.join(env.root, "alpha-wt", "feat/new-name")));
    expect(fs.existsSync(path.join(env.root, "alpha-wt", "feat/old-name"))).toBe(false);
    expect(fs.existsSync(wtAlpha)).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(wsPath, ".wtx-workspace.json"), "utf8"));
    expect(manifest.members).toEqual([{ repo: "alpha", branch: "feat/new-name" }]);

    const verify = runCli(env, ["workspace", "verify", "rename-demo"]);
    expect(verify.status).toBe(0);
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

  it("creates missing member worktrees before linking the workspace", async () => {
    const cfg = makeConfig(env.root, env.workspaceRoot, ["alpha", "beta"], {
      alpha: { sync_files: [".env"], post_create: ["touch hook-alpha"] },
      beta: { sync_files: [".env"], post_create: ["touch hook-beta"] },
    });
    writeConfig(env, cfg);

    const create = runCli(env, ["workspace", "create", "fresh", "--repo", "alpha,beta", "--branch", "feat/new"]);
    expect(create.status).toBe(0);

    const alphaWt = path.join(env.root, "alpha-wt", "feat", "new");
    const betaWt = path.join(env.root, "beta-wt", "feat", "new");
    const wsPath = path.join(env.workspaceRoot, "fresh");

    expect(fs.existsSync(alphaWt)).toBe(true);
    expect(fs.existsSync(betaWt)).toBe(true);
    expect(fs.readFileSync(path.join(alphaWt, ".env"), "utf8")).toBe("alpha=env\n");
    expect(fs.readFileSync(path.join(betaWt, ".env"), "utf8")).toBe("beta=env\n");
    expect(fs.existsSync(path.join(alphaWt, "hook-alpha"))).toBe(true);
    expect(fs.existsSync(path.join(betaWt, "hook-beta"))).toBe(true);
    expect(fs.realpathSync(path.join(wsPath, "alpha"))).toBe(fs.realpathSync(alphaWt));
    expect(fs.realpathSync(path.join(wsPath, "beta"))).toBe(fs.realpathSync(betaWt));

    const manifest = JSON.parse(fs.readFileSync(path.join(wsPath, ".wtx-workspace.json"), "utf8"));
    expect(manifest.members).toEqual([
      { repo: "alpha", branch: "feat/new" },
      { repo: "beta", branch: "feat/new" },
    ]);
  }, 30000);

  it("links only successful creates and writes a valid manifest after partial failure", async () => {
    const cfg = makeConfig(env.root, env.workspaceRoot, ["alpha", "beta"], {
      alpha: { sync_files: [".env"], post_create: ["touch hook-alpha"] },
      beta: { sync_files: [".env"], post_create: ["sh -c 'exit 7'"] },
    });
    writeConfig(env, cfg);

    const create = runCli(env, ["workspace", "create", "partial", "--repo", "alpha,beta", "--branch", "feat/partial"]);
    expect(create.status).toBe(1);
    expect(create.stdout + create.stderr).toContain("beta:feat/partial");

    const alphaWt = path.join(env.root, "alpha-wt", "feat", "partial");
    const betaWt = path.join(env.root, "beta-wt", "feat", "partial");
    const wsPath = path.join(env.workspaceRoot, "partial");

    expect(fs.existsSync(alphaWt)).toBe(true);
    expect(fs.existsSync(betaWt)).toBe(true);
    expect(fs.realpathSync(path.join(wsPath, "alpha"))).toBe(fs.realpathSync(alphaWt));
    expect(fs.existsSync(path.join(wsPath, "beta"))).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(wsPath, ".wtx-workspace.json"), "utf8"));
    expect(manifest).toEqual({
      version: 1,
      name: "partial",
      members: [{ repo: "alpha", branch: "feat/partial" }],
    });
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
