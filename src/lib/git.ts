import { execa } from "execa";
import fs from "fs";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { verbose } from "./log.js";

export async function gitExec(
  args: string[],
  opts: { cwd?: string; verbose?: boolean; dryRun?: boolean } = {}
): Promise<string> {
  if (opts.verbose) {
    verbose(`git ${args.join(" ")}${opts.cwd ? ` (cwd: ${opts.cwd})` : ""}`, true);
  }

  if (opts.dryRun) {
    return "";
  }

  try {
    const { stdout } = await execa("git", args, { cwd: opts.cwd });
    return stdout;
  } catch (err: any) {
    throw new Error(`git ${args.join(" ")} failed:\n${err.stderr || err.message}`);
  }
}

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isLocked: boolean;
  isPrunable: boolean;
  isBare: boolean;
}

export async function getWorktreeList(repoPath: string): Promise<Worktree[]> {
  const stdout = await gitExec(["-C", repoPath, "worktree", "list", "--porcelain"]);
  if (!stdout) return [];

  const blocks = stdout.split(/\n\n+/).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").filter(Boolean);
    const wt: Partial<Worktree> = {
      isLocked: false,
      isPrunable: false,
      isBare: false,
    };

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        wt.path = line.substring(9);
      } else if (line.startsWith("HEAD ")) {
        wt.commit = line.substring(5);
      } else if (line.startsWith("branch refs/heads/")) {
        wt.branch = line.substring(18);
      } else if (line === "locked") {
        wt.isLocked = true;
      } else if (line === "prunable") {
        wt.isPrunable = true;
      } else if (line === "bare") {
        wt.isBare = true;
      }
    }

    return wt as Worktree;
  });
}

export async function branchExistsOnRemote(
  repoPath: string,
  branch: string,
  opts: GlobalOptions,
  remote: string
): Promise<boolean> {
  if (opts.verbose) {
    verbose(`Checking remote branch: git -C ${repoPath} ls-remote --exit-code --heads ${remote} ${branch}`, true);
  }
  
  if (opts.dryRun) {
    return false;
  }

  try {
    await execa("git", ["-C", repoPath, "ls-remote", "--exit-code", "--heads", remote, branch]);
    return true;
  } catch (err: any) {
    if (err.exitCode === 2) {
      return false;
    }
    throw new Error(`git ls-remote failed:\n${err.stderr || err.message}`);
  }
}

export async function getLatestCommit(repoPath: string, ref: string): Promise<{ hash: string; subject: string }> {
  const stdout = await gitExec(["-C", repoPath, "log", "-1", "--format=%h %s", ref]);
  const splitIdx = stdout.indexOf(" ");
  if (splitIdx === -1) {
    return { hash: stdout, subject: "" };
  }
  return {
    hash: stdout.substring(0, splitIdx),
    subject: stdout.substring(splitIdx + 1),
  };
}

export async function getDirtyFiles(worktreePath: string): Promise<string[]> {
  const stdout = await gitExec(["-C", worktreePath, "status", "--porcelain"]);
  return stdout.split("\n").filter(Boolean);
}

export function detectInProgressRebase(wtPath: string): string | null {
  const dotGitPath = path.join(wtPath, ".git");

  try {
    const stat = fs.statSync(dotGitPath);
    let gitDir: string;

    if (stat.isFile()) {
      const content = fs.readFileSync(dotGitPath, "utf-8").trim();
      const prefix = "gitdir: ";
      if (!content.startsWith(prefix)) return null;
      gitDir = content.substring(prefix.length);
      if (!path.isAbsolute(gitDir)) {
        gitDir = path.resolve(wtPath, gitDir);
      }
    } else {
      gitDir = dotGitPath;
    }

    if (fs.existsSync(path.join(gitDir, "rebase-merge"))) {
      const stepFile = path.join(gitDir, "rebase-merge", "msgnum");
      const totalFile = path.join(gitDir, "rebase-merge", "end");
      if (fs.existsSync(stepFile) && fs.existsSync(totalFile)) {
        const step = fs.readFileSync(stepFile, "utf-8").trim();
        const total = fs.readFileSync(totalFile, "utf-8").trim();
        return `in progress (${step}/${total} commits applied)`;
      }
      return "in progress";
    }

    if (fs.existsSync(path.join(gitDir, "rebase-apply"))) {
      return "in progress (rebase-apply)";
    }
  } catch {}

  return null;
}

export async function localBranchExists(
  repoPath: string,
  branch: string,
  opts: GlobalOptions
): Promise<boolean> {
  if (opts.verbose) {
    verbose(`Checking local branch: git -C ${repoPath} rev-parse --verify --quiet refs/heads/${branch}`, true);
  }

  if (opts.dryRun) {
    return false;
  }

  try {
    await execa("git", ["-C", repoPath, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch (err: any) {
    if (err.exitCode === 1) {
      return false;
    }
    throw new Error(`git rev-parse failed:\n${err.stderr || err.message}`);
  }
}

export function validateSafeBranchName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name === "HEAD") return false;
  if (name.startsWith("-")) return false;
  if (name.includes("..")) return false;
  return /^[A-Za-z0-9._/\-]+$/.test(name);
}

export async function getRemoteBranchSha(
  repoPath: string,
  remote: string,
  branch: string,
  opts: GlobalOptions
): Promise<string | null> {
  if (opts.verbose) {
    verbose(`Checking remote branch: git -C ${repoPath} ls-remote --exit-code --heads ${remote} ${branch}`, true);
  }
  
  if (opts.dryRun) {
    return null;
  }

  try {
    const { stdout } = await execa("git", ["-C", repoPath, "ls-remote", "--exit-code", "--heads", remote, branch]);
    const match = stdout.trim().split(/\s+/);
    return match[0] || null;
  } catch (err: any) {
    if (err.exitCode === 2) {
      return null;
    }
    throw new Error(`git ls-remote failed:\n${err.stderr || err.message}`);
  }
}

export async function getLocalBranchSha(
  repoPath: string,
  branch: string,
  opts: GlobalOptions
): Promise<string | null> {
  if (opts.verbose) {
    verbose(`Checking local branch: git -C ${repoPath} show-ref --verify refs/heads/${branch}`, true);
  }

  if (opts.dryRun) {
    return null;
  }

  try {
    const { stdout } = await execa("git", ["-C", repoPath, "show-ref", "--verify", `refs/heads/${branch}`]);
    const match = stdout.trim().split(/\s+/);
    return match[0] || null;
  } catch (err: any) {
    if (err.exitCode === 1) {
      return null;
    }
    throw new Error(`git show-ref failed:\n${err.stderr || err.message}`);
  }
}
