import readline from "readline";
import { VERSION } from "../../types.js";
import { loadConfig } from "../config.js";
import {
  resolveRepos,
  getWorktreePath,
  resolveMainBranch,
  findWorktreeForBranch,
} from "../resolver.js";
import {
  validateSafeBranchName,
  getWorktreeList,
  getDirtyFiles,
  gitExec,
  
  branchExistsOnRemote,
  localBranchExists,
  getRemoteBranchSha,
  getLocalBranchSha,
} from "../git.js";
import { detectDepsState } from "../deps.js";
import {
  resolveBaseRemote,
} from "../remotes.js";
import {
  resolveBranchTarget,
} from "../branch-resolution.js";
import {
  isSafeWorktreeConfig,
  cleanupEmptyParents,
  safeResolve,
} from "../path-safety.js";
import fs from "fs";

export interface McpServerOptions {
  verbose?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export async function runMcpServer(opts: McpServerOptions = {}): Promise<void> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;

  const rl = readline.createInterface({
    input,
    terminal: false,
  });

  const send = (obj: any) => {
    output.write(JSON.stringify(obj) + "\n");
  };

  const sendError = (id: string | number | null, code: number, message: string) => {
    send({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    });
  };

  const config = loadConfig();

  for await (const line of rl) {
    if (!line.trim()) continue;

    let req: any;
    try {
      req = JSON.parse(line);
    } catch (err) {
      sendError(null, -32700, "Parse error");
      continue;
    }

    if (req.jsonrpc !== "2.0") {
      sendError(req.id ?? null, -32600, "Invalid Request");
      continue;
    }

    if (!req.method) {
      if (req.id !== undefined) {
        sendError(req.id, -32600, "Invalid Request");
      }
      continue;
    }

    try {
      await handleRequest(req, send, config, opts);
    } catch (err: any) {
      if (req.id !== undefined) {
        sendError(req.id, -32603, err.message || "Internal error");
      }
    }
  }
}

async function handleRequest(req: any, send: (obj: any) => void, config: any, opts: McpServerOptions) {
  const { method, params, id } = req;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "wtx", version: VERSION },
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "ping") {
    send({
      jsonrpc: "2.0",
      id,
      result: {},
    });
    return;
  }

  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "list_worktrees",
            description: "List worktrees for configured repos",
            inputSchema: {
              type: "object",
              properties: { repo: { type: "string" } },
            },
          },
          {
            name: "worktree_status",
            description: "Get status of a specific worktree",
            inputSchema: {
              type: "object",
              properties: { repo: { type: "string" }, branch: { type: "string" } },
              required: ["repo", "branch"],
            },
          },
          {
            name: "create_worktree",
            description: "Create a new worktree",
            inputSchema: {
              type: "object",
              properties: { repo: { type: "string" }, branch: { type: "string" }, base: { type: "string" } },
              required: ["repo", "branch"],
            },
          },
          {
            name: "remove_worktree",
            description: "Remove a worktree",
            inputSchema: {
              type: "object",
              properties: { repo: { type: "string" }, branch: { type: "string" }, confirm: { type: "boolean" }, force: { type: "boolean" } },
              required: ["repo", "branch", "confirm"],
            },
          },
          {
            name: "rebase_worktree",
            description: "Rebase a worktree against main branch",
            inputSchema: {
              type: "object",
              properties: { repo: { type: "string" }, branch: { type: "string" } },
              required: ["repo", "branch"],
            },
          },
        ],
      },
    });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};

    try {
      const result = await handleToolCall(name, args, config, opts);
      send({
        jsonrpc: "2.0",
        id,
        result,
      });
    } catch (err: any) {
      if (err.isToolError) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(err.message) }],
            isError: true,
          },
        });
      } else if (err.isSchemaError) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: err.message },
        });
      } else {
        throw err;
      }
    }
    return;
  }

  if (id !== undefined) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  }
}

async function handleToolCall(name: string, args: any, config: any, _opts: McpServerOptions) {
  switch (name) {
    case "list_worktrees": {
      if (args.repo !== undefined && typeof args.repo !== "string") {
        throw { isSchemaError: true, message: "repo must be a string" };
      }
      const repos = resolveRepos(config, args.repo ? [args.repo] : undefined);
      const items = [];
      for (const repo of repos) {
        const wts = await getWorktreeList(repo.mainPath);
        for (const wt of wts) {
          if (!wt.path.startsWith(repo.wtRoot)) continue;
          const dirtyCount = fs.existsSync(wt.path) ? (await getDirtyFiles(wt.path)).length : 0;
          items.push({
            repo: repo.name,
            branch: wt.branch || null,
            path: wt.path,
            sha: wt.commit ? wt.commit.substring(0, 7) : null,
            dirtyFiles: dirtyCount,
          });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(items) }] };
    }
    case "worktree_status": {
      if (typeof args.repo !== "string" || typeof args.branch !== "string") {
        throw { isSchemaError: true, message: "repo and branch are required strings" };
      }
      if (!validateSafeBranchName(args.branch)) {
        throw { isToolError: true, message: "unsafe branch name" };
      }
      const repo = resolveRepos(config, [args.repo])[0]!;
      const wtPath = getWorktreePath(repo, args.branch);
      if (!fs.existsSync(wtPath)) {
        throw { isToolError: true, message: `Worktree not found for branch ${args.branch}` };
      }
      const mainBranch = await resolveMainBranch(repo, config);
      const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
      
      const dirtyFiles = await getDirtyFiles(wtPath);
      let ahead = null;
      let behind = null;
      try {
        const countOutput = await gitExec(
          ["-C", wtPath, "rev-list", "--left-right", "--count", `${resolvedRemote}/${mainBranch}...HEAD`]
        );
        const parts = countOutput.trim().split(/\s+/);
        behind = parts[0] ? parseInt(parts[0], 10) : null;
        ahead = parts[1] ? parseInt(parts[1], 10) : null;
      } catch {}

      const depsState = detectDepsState(wtPath, repo.mainPath);
      const sha = await gitExec(["-C", wtPath, "rev-parse", "--short", "HEAD"]).then(s => s.trim());

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            path: wtPath,
            sha,
            dirtyCount: dirtyFiles.length,
            ahead,
            behind,
            depsStrategy: depsState.strategy,
          }),
        }],
      };
    }
    case "create_worktree": {
      if (typeof args.repo !== "string" || typeof args.branch !== "string") {
        throw { isSchemaError: true, message: "repo and branch are required strings" };
      }
      if (args.base !== undefined && typeof args.base !== "string") {
        throw { isSchemaError: true, message: "base must be a string" };
      }
      if (!validateSafeBranchName(args.branch)) {
        throw { isToolError: true, message: "unsafe branch name" };
      }
      if (args.base !== undefined && !validateSafeBranchName(args.base)) {
        throw { isToolError: true, message: "unsafe base ref" };
      }
      const repo = resolveRepos(config, [args.repo])[0]!;
      const wtPath = getWorktreePath(repo, args.branch);
      const safeWtPath = safeResolve(wtPath);
      
      const existing = await getWorktreeList(repo.mainPath);
      if (existing.some(w => safeResolve(w.path) === safeWtPath || w.branch === args.branch)) {
        throw { isToolError: true, message: `Worktree or branch ${args.branch} already exists` };
      }

      const mainBranch = await resolveMainBranch(repo, config);
      const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);

      if (repo.config.fetch_main_on_create !== false) {
        await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, "--", mainBranch]);
      }

      const localExists = await localBranchExists(repo.mainPath, args.branch, { verbose: false, dryRun: false });
      const remoteExists = await branchExistsOnRemote(repo.mainPath, args.branch, { verbose: false, dryRun: false }, resolvedRemote);
      const localSha = localExists ? await getLocalBranchSha(repo.mainPath, args.branch, { verbose: false, dryRun: false }) : null;
      const remoteSha = remoteExists ? await getRemoteBranchSha(repo.mainPath, resolvedRemote, args.branch, { verbose: false, dryRun: false }) : null;

      const resolution = resolveBranchTarget({ localExists, localSha, remoteExists, remoteSha });
      
      if (resolution.kind === "diverged") {
        throw { isToolError: true, message: `Branch diverged: local=${resolution.localSha}, remote=${resolution.remoteSha}` };
      }

      const gitArgs = ["-C", repo.mainPath, "worktree", "add"];
      if (resolution.kind === "create-new") {
        gitArgs.push("-b", args.branch, wtPath, args.base || `${resolvedRemote}/${mainBranch}`);
      } else if (resolution.kind === "track-remote") {
        gitArgs.push("--track", "-b", args.branch, wtPath, `${resolvedRemote}/${args.branch}`);
      } else if (resolution.kind === "use-local") {
        gitArgs.push(wtPath, args.branch);
      }

      await gitExec(gitArgs);

      return {
        content: [{ type: "text", text: JSON.stringify({ path: wtPath }) }],
      };
    }
    case "remove_worktree": {
      if (typeof args.repo !== "string" || typeof args.branch !== "string" || typeof args.confirm !== "boolean") {
        throw { isSchemaError: true, message: "repo, branch, and confirm are required and typed correctly" };
      }
      if (!validateSafeBranchName(args.branch)) {
        throw { isToolError: true, message: "unsafe branch name" };
      }
      if (args.force !== undefined && typeof args.force !== "boolean") {
        throw { isSchemaError: true, message: "force must be a boolean" };
      }
      if (args.confirm !== true) {
        throw { isToolError: true, message: "removal requires confirm:true" };
      }
      const repo = resolveRepos(config, [args.repo])[0]!;
      const candidatePath = getWorktreePath(repo, args.branch);
      
      if (!isSafeWorktreeConfig(repo.wtRoot, repo.mainPath)) {
        throw { isToolError: true, message: "Unsafe worktree configuration" };
      }

      const existing = await getWorktreeList(repo.mainPath);
      const target = findWorktreeForBranch(existing, args.branch, repo.mainPath, candidatePath);
      if (!target) {
        throw { isToolError: true, message: `Worktree for ${args.branch} is not registered` };
      }
      const wtPath = target.path;

      if (!args.force && fs.existsSync(wtPath)) {
        const dirty = await getDirtyFiles(wtPath);
        if (dirty.length > 0) {
          throw { isToolError: true, message: `Worktree is dirty. Use force:true to remove it.` };
        }
      }

      await gitExec(["-C", repo.mainPath, "worktree", "remove", args.force ? "--force" : "", wtPath].filter(Boolean));
      cleanupEmptyParents(repo.wtRoot, repo.mainPath, wtPath);

      return {
        content: [{ type: "text", text: JSON.stringify({ removed: true }) }],
      };
    }
    case "rebase_worktree": {
      if (typeof args.repo !== "string" || typeof args.branch !== "string") {
        throw { isSchemaError: true, message: "repo and branch are required strings" };
      }
      const repo = resolveRepos(config, [args.repo])[0]!;
      const wtPath = getWorktreePath(repo, args.branch);
      
      if (!fs.existsSync(wtPath)) {
        throw { isToolError: true, message: `Worktree not found for branch ${args.branch}` };
      }

      const mainBranch = await resolveMainBranch(repo, config);
      const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
      
      await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, "--", mainBranch]);
      
      try {
        const rebaseOut = await gitExec(["-C", wtPath, "rebase", "--", `${resolvedRemote}/${mainBranch}`]);
        if (rebaseOut.includes("is up to date") || rebaseOut.includes("up-to-date")) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "up-to-date" }) }] };
        } else {
          const count = await gitExec(["-C", wtPath, "rev-list", "--count", `${resolvedRemote}/${mainBranch}..HEAD`]).then(s => s.trim());
          return { content: [{ type: "text", text: JSON.stringify({ status: "rebased", commits: count }) }] };
        }
      } catch (err: any) {
        const msg = `Rebase conflict. Resolve manually in ${wtPath}:\ncd ${wtPath} && git rebase --continue\nOr abort:\ncd ${wtPath} && git rebase --abort`;
        throw { isToolError: true, message: msg };
      }
    }
    default:
      throw { isSchemaError: true, message: `Unknown tool: ${name}` };
  }
}
