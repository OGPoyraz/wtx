import fs from "fs";
import path from "path";
import { expandTilde } from "./config.js";
import { isWithin, safeResolve } from "./path-safety.js";
import type { Config } from "../types.js";

const MANIFEST_FILE = ".wtx-workspace.json";
const AGENTS_FILE = "AGENTS.md";

export interface WorkspaceMember {
  repo: string;
  branch: string;
  path: string;
}

export interface WorkspaceManifestMember {
  repo: string;
  branch: string;
}

export interface WorkspaceManifest {
  version: 1;
  name: string;
  members: WorkspaceManifestMember[];
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  members: WorkspaceManifestMember[];
}

export interface VerifyResult {
  ok: boolean;
  broken: string[];
  cycles: string[];
}

export function getWorkspaceRoot(config: Config): string {
  return path.resolve(expandTilde(config.workspace_root ?? path.join(config.root, "wtx-workspaces")));
}

function workspacePathFor(name: string, config: Config): string {
  return path.join(getWorkspaceRoot(config), name);
}

function validateWorkspaceName(name: string): void {
  if (name.trim() === "") {
    throw new Error("Workspace name must not be empty");
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error("Workspace name must not contain path separators or '..'");
  }
}

function memberLinkName(member: WorkspaceManifestMember, taken: Set<string>): string {
  const repoName = member.repo;
  if (!taken.has(repoName)) {
    taken.add(repoName);
    return repoName;
  }

  const branchName = member.branch.replace(/[\\/]+/g, "-");
  const fallback = `${member.repo}-${branchName}`;
  if (!taken.has(fallback)) {
    taken.add(fallback);
    return fallback;
  }

  let suffix = 2;
  while (taken.has(`${fallback}-${suffix}`)) {
    suffix += 1;
  }
  const name = `${fallback}-${suffix}`;
  taken.add(name);
  return name;
}

function assertNoPathNesting(workspacePath: string, members: WorkspaceMember[]): void {
  const resolvedWorkspace = safeResolve(workspacePath);

  for (const member of members) {
    const resolvedMember = safeResolve(member.path);
    if (resolvedWorkspace === resolvedMember || isWithin(resolvedMember, resolvedWorkspace)) {
      throw new Error(`Workspace path must not be inside member ${member.repo}:${member.branch}`);
    }
    if (isWithin(resolvedWorkspace, resolvedMember)) {
      throw new Error(`Member path must not be inside workspace: ${member.repo}:${member.branch}`);
    }
  }
}

async function writeManifest(workspacePath: string, manifest: WorkspaceManifest): Promise<void> {
  const manifestPath = path.join(workspacePath, MANIFEST_FILE);
  const tmpPath = path.join(workspacePath, `${MANIFEST_FILE}.${process.pid}.${Date.now()}.tmp`);
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.promises.rename(tmpPath, manifestPath);
}

async function readManifest(workspacePath: string): Promise<WorkspaceManifest> {
  const raw = await fs.promises.readFile(path.join(workspacePath, MANIFEST_FILE), "utf8");
  const parsed = JSON.parse(raw) as WorkspaceManifest;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported workspace manifest version: ${parsed.version}`);
  }
  return parsed;
}

async function writeAgentsFile(workspacePath: string, linkNames: string[]): Promise<void> {
  const lines = [
    "# WTX Workspace",
    "",
    "Member folders:",
    ...linkNames.map((name) => `- ${name}`),
    "",
  ];
  await fs.promises.writeFile(path.join(workspacePath, AGENTS_FILE), lines.join("\n"), "utf8");
}

async function createMemberSymlinks(workspacePath: string, members: WorkspaceMember[]): Promise<string[]> {
  const taken = new Set<string>();
  const linkNames: string[] = [];

  for (const member of members) {
    const linkName = memberLinkName(member, taken);
    const linkPath = path.join(workspacePath, linkName);
    const target = path.resolve(member.path);
    await fs.promises.symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    linkNames.push(linkName);
  }

  return linkNames;
}

async function workspaceLinkNames(workspacePath: string): Promise<string[]> {
  const entries = await fs.promises.readdir(workspacePath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== MANIFEST_FILE && entry.name !== AGENTS_FILE && entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
}

async function rebuildAgentsFile(workspacePath: string): Promise<void> {
  await writeAgentsFile(workspacePath, await workspaceLinkNames(workspacePath));
}

export async function createWorkspace(opts: {
  name: string;
  members: WorkspaceMember[];
  config: Config;
}): Promise<void> {
  validateWorkspaceName(opts.name);
  const workspacePath = workspacePathFor(opts.name, opts.config);
  assertNoPathNesting(workspacePath, opts.members);

  await fs.promises.mkdir(workspacePath, { recursive: true });
  const linkNames = await createMemberSymlinks(workspacePath, opts.members);
  await writeManifest(workspacePath, {
    version: 1,
    name: opts.name,
    members: opts.members.map(({ repo, branch }) => ({ repo, branch })),
  });
  await writeAgentsFile(workspacePath, linkNames);
}

export async function addMember(opts: { workspacePath: string; member: WorkspaceMember }): Promise<void> {
  assertNoPathNesting(opts.workspacePath, [opts.member]);
  const manifest = await readManifest(opts.workspacePath);
  if (manifest.members.some((member) => member.repo === opts.member.repo && member.branch === opts.member.branch)) {
    throw new Error(`Workspace already contains ${opts.member.repo}:${opts.member.branch}`);
  }

  const taken = new Set(await workspaceLinkNames(opts.workspacePath));
  const linkName = memberLinkName(opts.member, taken);
  const target = path.resolve(opts.member.path);
  await fs.promises.symlink(target, path.join(opts.workspacePath, linkName), process.platform === "win32" ? "junction" : "dir");

  manifest.members.push({ repo: opts.member.repo, branch: opts.member.branch });
  await writeManifest(opts.workspacePath, manifest);
  await rebuildAgentsFile(opts.workspacePath);
}

export async function removeMember(opts: { workspacePath: string; repo: string; branch: string }): Promise<void> {
  const manifest = await readManifest(opts.workspacePath);
  const nextMembers = manifest.members.filter(
    (member) => !(member.repo === opts.repo && member.branch === opts.branch)
  );
  if (nextMembers.length === manifest.members.length) {
    throw new Error(`Workspace does not contain ${opts.repo}:${opts.branch}`);
  }

  const linkNames = await workspaceLinkNames(opts.workspacePath);
  for (const linkName of linkNames) {
    if (linkName === opts.repo || linkName === `${opts.repo}-${opts.branch.replace(/[\\/]+/g, "-")}`) {
      await fs.promises.unlink(path.join(opts.workspacePath, linkName));
      break;
    }
  }

  await writeManifest(opts.workspacePath, { ...manifest, members: nextMembers });
  await rebuildAgentsFile(opts.workspacePath);
}

export async function listWorkspaces(workspaceRoot: string): Promise<WorkspaceInfo[]> {
  try {
    const entries = await fs.promises.readdir(path.resolve(expandTilde(workspaceRoot)), { withFileTypes: true });
    const workspaces: WorkspaceInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspacePath = path.join(path.resolve(expandTilde(workspaceRoot)), entry.name);
      try {
        const manifest = await readManifest(workspacePath);
        workspaces.push({ name: manifest.name, path: workspacePath, members: manifest.members });
      } catch {}
    }
    return workspaces.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return [];
    throw err;
  }
}

export async function findWorkspacesForMember(
  workspaceRoot: string,
  repo: string,
  branch: string
): Promise<string[]> {
  const workspaces = await listWorkspaces(workspaceRoot);
  return workspaces
    .filter((workspace) => workspace.members.some((member) => member.repo === repo && member.branch === branch))
    .map((workspace) => workspace.name)
    .sort();
}

async function verifyLink(linkPath: string, visited: Set<string>): Promise<"ok" | "broken" | "cycle"> {
  const resolvedLink = safeResolve(linkPath);
  if (visited.has(resolvedLink)) return "cycle";
  visited.add(resolvedLink);

  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(linkPath);
  } catch {
    return "broken";
  }

  if (!stats.isSymbolicLink()) return "ok";

  let rawTarget: string;
  try {
    rawTarget = await fs.promises.readlink(linkPath);
  } catch {
    return "broken";
  }
  const target = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(path.dirname(linkPath), rawTarget);

  try {
    const targetStats = await fs.promises.lstat(target);
    if (!targetStats.isSymbolicLink()) return "ok";
  } catch {
    return "broken";
  }

  return verifyLink(target, visited);
}

export async function verify(workspacePath: string): Promise<VerifyResult> {
  const result: VerifyResult = { ok: true, broken: [], cycles: [] };
  try {
    const entries = await fs.promises.readdir(workspacePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === MANIFEST_FILE || entry.name === AGENTS_FILE || !entry.isSymbolicLink()) continue;
      const status = await verifyLink(path.join(workspacePath, entry.name), new Set<string>());
      if (status === "broken") result.broken.push(entry.name);
      if (status === "cycle") result.cycles.push(entry.name);
    }
  } catch {
    return { ok: false, broken: [], cycles: [] };
  }

  result.broken.sort();
  result.cycles.sort();
  result.ok = result.broken.length === 0 && result.cycles.length === 0;
  return result;
}
