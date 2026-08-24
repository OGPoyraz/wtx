import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { PassThrough } from "stream";
import { runMcpServer } from "../src/lib/mcp/server.js";
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

let xdgConfigFile: string;

beforeAll(() => {
  process.env.GIT_AUTHOR_NAME = "wtx-test";
  process.env.GIT_AUTHOR_EMAIL = "wtx-test@example.com";
  process.env.GIT_COMMITTER_NAME = "wtx-test";
  process.env.GIT_COMMITTER_EMAIL = "wtx-test@example.com";
  const tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), "wtx-mcp-xdg-"));
  process.env.XDG_CONFIG_HOME = tmpXdg;
  process.env.WTX_NO_WIZARD = "1";
  const cfgDir = path.join(tmpXdg, "wtx");
  fs.mkdirSync(cfgDir, { recursive: true });
  xdgConfigFile = path.join(cfgDir, "config.json");
  fs.writeFileSync(xdgConfigFile, JSON.stringify({ version: 1, root: "~/Repos", repos: {} }));
});

afterAll(() => {
  if (process.env.XDG_CONFIG_HOME?.includes("wtx-mcp-xdg-")) {
    fs.rmSync(process.env.XDG_CONFIG_HOME, { recursive: true, force: true });
  }
});


function git(args: string[], cwd?: string) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("MCP Server", () => {
  let tempRoot: string;
  let mainPath: string;
  let barePath: string;
  let wtRoot: string;
  let repoName: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wtx-mcp-test-"));
    repoName = "testrepo";
    barePath = path.join(tempRoot, "bare.git");
    mainPath = path.join(tempRoot, repoName);
    wtRoot = path.join(tempRoot, `${repoName}-wt`);

    // Create bare repo
    fs.mkdirSync(barePath, { recursive: true });
    git(["init", "--bare", "-b", "main"], barePath);

    // Create main repo
    git(["clone", barePath, mainPath]);
    fs.writeFileSync(path.join(mainPath, "README.md"), "test");
    git(["add", "README.md"], mainPath);
    git(["commit", "-m", "init"], mainPath);
    git(["push", "origin", "main"], mainPath);

    // Config setup
    const testConfig = {
      version: 1,
      root: tempRoot,
      postfix: "-wt",
      ide: "cursor",
      default_main_branch: "main",
      user: null,
      repos: {
        [repoName]: {
          main_branch: "main",
          fetch_main_on_create: true,
          check_prs: true,
          forge_provider: "auto",
          pr_lookup_repo: null,
          deps: { manager: "auto", strategy: "auto" }
        }
      },
      ports: { min: 4100, max: 4999 }
    };
    
    fs.writeFileSync(xdgConfigFile, JSON.stringify(testConfig, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  async function sendAndReceive(messages: any[]): Promise<any[]> {
    const input = new PassThrough();
    const output = new PassThrough();

    const results: any[] = [];
    
    const serverPromise = runMcpServer({ input, output });

    output.on("data", (chunk) => {
      const lines = chunk.toString().trim().split("\n");
      for (const line of lines) {
        if (line) {
          try {
            results.push(JSON.parse(line));
          } catch {}
        }
      }
    });

    for (const msg of messages) {
      input.write(typeof msg === "string" ? msg + "\n" : JSON.stringify(msg) + "\n");
    }
    input.end();

    await serverPromise;
    return results;
  }

  it("handles initialize and ping", async () => {
    const res = await sendAndReceive([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ]);

    expect(res).toHaveLength(2);
    
    expect(res[0].id).toBe(1);
    expect(res[0].result.protocolVersion).toBe("2024-11-05");
    expect(res[0].result.capabilities.tools).toBeDefined();

    expect(res[1].id).toBe(2);
    expect(res[1].result).toEqual({});
  });

  it("handles parse error", async () => {
    const res = await sendAndReceive([
      "{"
    ]);

    expect(res).toHaveLength(1);
    expect(res[0].id).toBeNull();
    expect(res[0].error.code).toBe(-32700);
  });

  it("lists exactly 5 tools", async () => {
    const res = await sendAndReceive([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ]);

    expect(res).toHaveLength(1);
    expect(res[0].result.tools).toHaveLength(5);
    const names = res[0].result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      "create_worktree",
      "list_worktrees",
      "rebase_worktree",
      "remove_worktree",
      "worktree_status",
    ]);
  });

  it("remove_worktree WITHOUT confirm -> isError", async () => {
    const res = await sendAndReceive([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "remove_worktree",
          arguments: { repo: repoName, branch: "feat" }
        }
      }
    ]);

    expect(res).toHaveLength(1);
    expect(res[0].error).toBeDefined();
    expect(res[0].error.code).toBe(-32602);
    expect(res[0].error.message).toMatch(/confirm/);
  });

  it("remove_worktree WITH confirm false -> tool error", async () => {
    const res = await sendAndReceive([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "remove_worktree",
          arguments: { repo: repoName, branch: "feat", confirm: false }
        }
      }
    ]);

    expect(res).toHaveLength(1);
    expect(res[0].result.isError).toBe(true);
    expect(res[0].result.content[0].text).toContain("confirm:true");
  });

  it("remove_worktree WITH confirm true successfully removes", async () => {
    // Add worktree
    const wtBranchPath = path.join(wtRoot, "feat");
    git(["worktree", "add", "-b", "feat", wtBranchPath, "main"], mainPath);
    expect(fs.existsSync(wtBranchPath)).toBe(true);

    const res = await sendAndReceive([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "remove_worktree",
          arguments: { repo: repoName, branch: "feat", confirm: true }
        }
      }
    ]);

    expect(res).toHaveLength(1);
    expect(res[0].result.isError).toBeUndefined(); // No error
    const content = JSON.parse(res[0].result.content[0].text);
    expect(content.removed).toBe(true);
    expect(fs.existsSync(wtBranchPath)).toBe(false);
  });
});
