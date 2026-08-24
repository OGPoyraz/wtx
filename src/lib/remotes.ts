import { execa } from "execa";
import { gitExec } from "./git.js";

export async function listRemotes(repoPath: string): Promise<string[]> {
  const stdout = await gitExec(["-C", repoPath, "remote"]);
  return stdout.split("\n").filter(Boolean);
}

export async function getBranchUpstreamRemote(
  repoPath: string,
  branch: string
): Promise<string | null> {
  try {
    const { stdout } = await execa("git", [
      "-C",
      repoPath,
      "config",
      "--get",
      `branch.${branch}.remote`,
    ]);
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function hasRemote(repoPath: string, name: string): Promise<boolean> {
  return (await listRemotes(repoPath)).includes(name);
}

/**
 * Resolve which remote should be treated as the "base" remote for main-branch
 * operations (fetch/rebase/status/create tracking).
 *
 * Priority: configured upstream of <mainBranch> > "upstream" > "origin" >
 * sole remote. Throws an actionable error when nothing resolvable exists.
 */
export async function resolveBaseRemote(
  repoPath: string,
  mainBranch: string
): Promise<string> {
  const upstream = await getBranchUpstreamRemote(repoPath, mainBranch);
  if (upstream) return upstream;

  if (await hasRemote(repoPath, "upstream")) return "upstream";
  if (await hasRemote(repoPath, "origin")) return "origin";

  const remotes = await listRemotes(repoPath);
  if (remotes.length === 1) return remotes[0]!;

  const found = remotes.length > 0 ? `Found remotes: ${remotes.join(", ")}.` : "No remotes configured.";
  throw new Error(
    `Could not determine base remote for "${mainBranch}". ${found} Set \`repos.<name>.main_branch\` upstream or add an "origin" remote.`
  );
}
