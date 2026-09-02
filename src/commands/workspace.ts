import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { expandTilde, loadConfig } from "../lib/config.js";
import {
  info,
  indented,
  repoHeader,
  stepError,
  stepProgress,
  stepSuccess,
  stepWarning,
  summary,
  summaryWarning,
} from "../lib/log.js";
import { getWorktreeList } from "../lib/git.js";
import {
  getWorktreePath,
  parseRepoFlag,
  resolveRepos,
} from "../lib/resolver.js";
import { canProceedDeletion, confirm, isInteractive } from "../lib/prompts.js";
import {
  addMember,
  createWorkspace,
  listWorkspaces,
  removeMember,
  verify,
  type WorkspaceMember,
} from "../lib/workspace.js";

interface WorkspaceCreateOptions {
  repo?: string[];
  branch?: string;
}

interface WorkspaceLsOptions {
  json?: boolean;
}

interface WorkspaceRemoveOptions {
  yes?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function workspaceRootFor(config: ReturnType<typeof loadConfig>): string {
  const raw = config.workspace_root ?? path.join(config.root, "wtx-workspaces");
  return path.resolve(expandTilde(raw));
}

function workspacePathFor(config: ReturnType<typeof loadConfig>, name: string): string {
  return path.join(workspaceRootFor(config), name);
}

async function resolveWorktreePathForMember(
  config: ReturnType<typeof loadConfig>,
  repoName: string,
  branch: string
): Promise<string | null> {
  const repos = resolveRepos(config, [repoName]);
  if (repos.length === 0) return null;
  const repo = repos[0]!;

  const worktrees = await getWorktreeList(repo.mainPath);
  const match = worktrees.find((wt) => wt.branch === branch);
  if (match) return match.path;

  const candidate = getWorktreePath(repo, branch);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

async function collectMembers(
  config: ReturnType<typeof loadConfig>,
  repoFilter: string[] | undefined,
  branch: string
): Promise<{ members: WorkspaceMember[]; missing: Array<{ repo: string; branch: string }> }> {
  const repos = resolveRepos(config, repoFilter);
  const members: WorkspaceMember[] = [];
  const missing: Array<{ repo: string; branch: string }> = [];

  for (const repo of repos) {
    const wtPath = await resolveWorktreePathForMember(config, repo.name, branch);
    if (wtPath) {
      members.push({ repo: repo.name, branch, path: wtPath });
    } else {
      missing.push({ repo: repo.name, branch });
    }
  }

  return { members, missing };
}

function requireConfirmation(
  yesFlag: boolean | undefined,
  action: string
): Promise<boolean> {
  const interactive = isInteractive();
  const envYes = process.env.WTX_YES === "1";

  if (!canProceedDeletion({ interactive, yesFlag: !!yesFlag, envYes })) {
    stepError("Non-interactive terminal requires --yes flag or WTX_YES=1 for scripts");
    process.exit(1);
  }

  if (interactive && !yesFlag && !envYes) {
    return confirm(action);
  }
  return Promise.resolve(true);
}

function registerCreateSub(workspace: Command): void {
  workspace
    .command("create <name>")
    .description("Create a workspace linking existing worktrees")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("-b, --branch <branch>", "Branch to include for each repo")
    .action(async (name: string, options: WorkspaceCreateOptions) => {
      const globalOpts = workspace.parent!.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);

      if (!options.branch) {
        stepError("--branch is required", "specify the branch shared across members");
        process.exit(1);
      }

      const wsPath = workspacePathFor(config, name);
      if (fs.existsSync(wsPath)) {
        stepError("Workspace already exists", wsPath);
        process.exit(1);
      }

      let members: WorkspaceMember[];
      let missing: Array<{ repo: string; branch: string }>;
      try {
        const result = await collectMembers(config, repoFilter, options.branch);
        members = result.members;
        missing = result.missing;
      } catch (err) {
        stepError("Failed to resolve repos", errorMessage(err));
        process.exit(1);
      }

      for (const m of missing) {
        stepWarning("No worktree found", `${m.repo}:${m.branch} (skipped)`);
      }

      if (members.length === 0) {
        stepError("No members to link", "create the worktrees first (e.g. `wtx create <branch>`)");
        process.exit(1);
      }

      if (globalOpts.dryRun) {
        stepProgress("Would create workspace", wsPath);
        for (const m of members) {
          indented(`link ${m.repo}:${m.branch} → ${m.path}`);
        }
        summary(`Dry-run — ${members.length} member${members.length === 1 ? "" : "s"} planned`);
        return;
      }

      try {
        await createWorkspace({ name, members, config });
        stepSuccess("Workspace created", wsPath);
        for (const m of members) {
          indented(`${m.repo}:${m.branch} → ${m.path}`);
        }
        summary(`Done — workspace ${name} created with ${members.length} member${members.length === 1 ? "" : "s"}`);
      } catch (err) {
        stepError("Failed to create workspace", errorMessage(err));
        process.exit(1);
      }
    });
}

function registerLsSub(workspace: Command): void {
  workspace
    .command("ls")
    .description("List workspaces")
    .option("--json", "Output machine-readable JSON")
    .action(async (options: WorkspaceLsOptions) => {
      const config = loadConfig();
      const root = workspaceRootFor(config);

      let workspaces;
      try {
        workspaces = await listWorkspaces(root);
      } catch (err) {
        stepError("Failed to list workspaces", errorMessage(err));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(workspaces, null, 2));
        return;
      }

      if (workspaces.length === 0) {
        summaryWarning("No workspaces found");
        return;
      }

      for (const ws of workspaces) {
        repoHeader(ws.name);
        const health = await verify(ws.path);
        const state = health.ok ? "OK" : "BROKEN";
        info(`  ${state}  ${ws.path}`);
        for (const m of ws.members) {
          indented(`${m.repo}:${m.branch}`);
        }
        if (!health.ok) {
          if (health.broken.length > 0) indented(`broken: ${health.broken.join(", ")}`);
          if (health.cycles.length > 0) indented(`cycles: ${health.cycles.join(", ")}`);
        }
      }
      summary(`Done — ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`);
    });
}

function registerAddSub(workspace: Command): void {
  workspace
    .command("add <name> <repo> <branch>")
    .description("Link an existing worktree into a workspace")
    .action(async (name: string, repoName: string, branch: string) => {
      const globalOpts = workspace.parent!.opts<GlobalOptions>();
      const config = loadConfig();
      const wsPath = workspacePathFor(config, name);

      if (!fs.existsSync(wsPath)) {
        stepError("Workspace not found", wsPath);
        process.exit(1);
      }

      let memberPath: string | null;
      try {
        memberPath = await resolveWorktreePathForMember(config, repoName, branch);
      } catch (err) {
        stepError("Failed to resolve repo", errorMessage(err));
        process.exit(1);
      }

      if (!memberPath) {
        stepError("No worktree found", `${repoName}:${branch}`);
        process.exit(1);
      }

      if (globalOpts.dryRun) {
        stepProgress("Would link member", `${repoName}:${branch} → ${memberPath}`);
        return;
      }

      try {
        await addMember({
          workspacePath: wsPath,
          member: { repo: repoName, branch, path: memberPath },
        });
        stepSuccess("Member linked", `${repoName}:${branch} → ${memberPath}`);
      } catch (err) {
        stepError("Failed to add member", errorMessage(err));
        process.exit(1);
      }
    });
}

function registerRmSub(workspace: Command): void {
  workspace
    .command("rm <name> <repo> <branch>")
    .description("Unlink a member from a workspace (does not remove the worktree)")
    .action(async (name: string, repoName: string, branch: string) => {
      const globalOpts = workspace.parent!.opts<GlobalOptions>();
      const config = loadConfig();
      const wsPath = workspacePathFor(config, name);

      if (!fs.existsSync(wsPath)) {
        stepError("Workspace not found", wsPath);
        process.exit(1);
      }

      if (globalOpts.dryRun) {
        stepProgress("Would unlink member", `${repoName}:${branch}`);
        return;
      }

      try {
        await removeMember({ workspacePath: wsPath, repo: repoName, branch });
        stepSuccess("Member unlinked", `${repoName}:${branch}`);
      } catch (err) {
        stepError("Failed to remove member", errorMessage(err));
        process.exit(1);
      }
    });
}

function registerRemoveSub(workspace: Command): void {
  workspace
    .command("remove <name>")
    .description("Delete the workspace directory and manifest (member worktrees are untouched)")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name: string, options: WorkspaceRemoveOptions) => {
      const globalOpts = workspace.parent!.opts<GlobalOptions>();
      const config = loadConfig();
      const wsPath = workspacePathFor(config, name);

      if (!fs.existsSync(wsPath)) {
        stepError("Workspace not found", wsPath);
        process.exit(1);
      }

      if (globalOpts.dryRun) {
        stepProgress("Would remove workspace directory", wsPath);
        return;
      }

      const proceed = await requireConfirmation(
        options.yes,
        `Remove workspace directory ${wsPath}? (member worktrees are NOT deleted)`
      );
      if (!proceed) {
        stepWarning("Skipped by user", wsPath);
        return;
      }

      try {
        fs.rmSync(wsPath, { recursive: true, force: true });
        stepSuccess("Workspace removed", wsPath);
        summary(`Done — workspace ${name} deleted (member worktrees preserved)`);
      } catch (err) {
        stepError("Failed to remove workspace", errorMessage(err));
        process.exit(1);
      }
    });
}

function registerVerifySub(workspace: Command): void {
  workspace
    .command("verify <name>")
    .description("Verify that every workspace member link resolves")
    .action(async (name: string) => {
      const config = loadConfig();
      const wsPath = workspacePathFor(config, name);

      if (!fs.existsSync(wsPath)) {
        stepError("Workspace not found", wsPath);
        process.exit(1);
      }

      const result = await verify(wsPath);
      if (result.ok) {
        stepSuccess("Workspace healthy", wsPath);
        summary(`Done — ${name} verified`);
        return;
      }

      stepError("Workspace has broken members", wsPath);
      if (result.broken.length > 0) {
        indented(`broken: ${result.broken.join(", ")}`);
      }
      if (result.cycles.length > 0) {
        indented(`cycles: ${result.cycles.join(", ")}`);
      }
      process.exit(1);
    });
}

export function registerWorkspaceCommand(program: Command): void {
  const workspace = program
    .command("workspace")
    .description("Manage cross-repo workspaces");

  registerCreateSub(workspace);
  registerLsSub(workspace);
  registerAddSub(workspace);
  registerRmSub(workspace);
  registerRemoveSub(workspace);
  registerVerifySub(workspace);
}
