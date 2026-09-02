import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  addMember,
  createWorkspace,
  listWorkspaces,
  removeMember,
  verify,
  type WorkspaceMember,
} from "../src/lib/workspace.js";
import type { Config } from "../src/types.js";

describe("workspace", () => {
  let tmpDir: string;
  let root: string;
  let workspaceRoot: string;
  let config: Config;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wtx-workspace-")));
    root = path.join(tmpDir, "repos");
    workspaceRoot = path.join(tmpDir, "workspaces");
    fs.mkdirSync(root, { recursive: true });
    config = {
      version: 2,
      root,
      postfix: "-wt",
      ide: "cursor",
      default_main_branch: "main",
      user: null,
      repos: {},
      favorites: [],
      workspace_root: workspaceRoot,
      ports: { min: 4100, max: 4999 },
      tui: { leftPaneWidthWeight: 3, rightPaneWidthWeight: 7, theme: "tokyonight", custom_theme: null },
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function member(repo: string, branch: string): WorkspaceMember {
    const memberPath = path.join(root, `${repo}-${branch.replace(/[\\/]+/g, "-")}`);
    fs.mkdirSync(memberPath, { recursive: true });
    return { repo, branch, path: memberPath };
  }

  it("creates a symlink farm with manifest and AGENTS.md", async () => {
    const api = member("api", "feat/a");
    const apiOther = member("api", "feat/b");
    const web = member("web", "feat/a");

    await createWorkspace({ name: "team", members: [api, apiOther, web], config });

    const workspacePath = path.join(workspaceRoot, "team");
    expect(fs.realpathSync(path.join(workspacePath, "api"))).toBe(api.path);
    expect(fs.realpathSync(path.join(workspacePath, "api-feat-b"))).toBe(apiOther.path);
    expect(fs.realpathSync(path.join(workspacePath, "web"))).toBe(web.path);

    expect(JSON.parse(fs.readFileSync(path.join(workspacePath, ".wtx-workspace.json"), "utf8"))).toEqual({
      version: 1,
      name: "team",
      members: [
        { repo: "api", branch: "feat/a" },
        { repo: "api", branch: "feat/b" },
        { repo: "web", branch: "feat/a" },
      ],
    });
    expect(fs.readFileSync(path.join(workspacePath, "AGENTS.md"), "utf8")).toContain("- api-feat-b");

    await expect(listWorkspaces(workspaceRoot)).resolves.toEqual([
      {
        name: "team",
        path: workspacePath,
        members: [
          { repo: "api", branch: "feat/a" },
          { repo: "api", branch: "feat/b" },
          { repo: "web", branch: "feat/a" },
        ],
      },
    ]);
  });

  it("adds and removes members without deleting member worktrees", async () => {
    const api = member("api", "feat/a");
    const web = member("web", "feat/a");
    await createWorkspace({ name: "team", members: [api], config });

    const workspacePath = path.join(workspaceRoot, "team");
    await addMember({ workspacePath, member: web });
    expect(fs.realpathSync(path.join(workspacePath, "web"))).toBe(web.path);

    await removeMember({ workspacePath, repo: "api", branch: "feat/a" });
    expect(fs.existsSync(path.join(workspacePath, "api"))).toBe(false);
    expect(fs.existsSync(api.path)).toBe(true);
    expect(fs.readFileSync(path.join(workspacePath, "AGENTS.md"), "utf8")).not.toContain("- api");
  });

  it("verifies healthy, dangling, and cyclic symlinks without throwing", async () => {
    const api = member("api", "feat/a");
    await createWorkspace({ name: "team", members: [api], config });
    const workspacePath = path.join(workspaceRoot, "team");

    await expect(verify(workspacePath)).resolves.toEqual({ ok: true, broken: [], cycles: [] });

    fs.rmSync(api.path, { recursive: true, force: true });
    await expect(verify(workspacePath)).resolves.toEqual({ ok: false, broken: ["api"], cycles: [] });

    fs.unlinkSync(path.join(workspacePath, "api"));
    fs.symlinkSync(path.join(workspacePath, "cycle-b"), path.join(workspacePath, "cycle-a"));
    fs.symlinkSync(path.join(workspacePath, "cycle-a"), path.join(workspacePath, "cycle-b"));
    await expect(verify(workspacePath)).resolves.toEqual({ ok: false, broken: [], cycles: ["cycle-a", "cycle-b"] });
    await expect(verify(path.join(tmpDir, "missing"))).resolves.toEqual({ ok: false, broken: [], cycles: [] });
  });

  it("rejects unsafe workspace names", async () => {
    const api = member("api", "feat/a");
    await expect(createWorkspace({ name: "", members: [api], config })).rejects.toThrow("must not be empty");
    await expect(createWorkspace({ name: "a/b", members: [api], config })).rejects.toThrow("must not contain");
    await expect(createWorkspace({ name: "..", members: [api], config })).rejects.toThrow("must not contain");
  });

  it("rejects a workspace path inside a member path", async () => {
    const api = member("api", "feat/a");
    config.workspace_root = path.join(api.path, "nested");

    await expect(createWorkspace({ name: "team", members: [api], config })).rejects.toThrow(
      "Workspace path must not be inside member"
    );
  });

  it("rejects a member path inside the workspace directory", async () => {
    const nestedMember = path.join(workspaceRoot, "team", "nested-member");
    fs.mkdirSync(nestedMember, { recursive: true });

    await expect(
      createWorkspace({ name: "team", members: [{ repo: "api", branch: "feat/a", path: nestedMember }], config })
    ).rejects.toThrow("Member path must not be inside workspace");
  });
});
