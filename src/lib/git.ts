import { execa } from "execa";
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
  opts: GlobalOptions
): Promise<boolean> {
  if (opts.verbose) {
    verbose(`Checking remote branch: git -C ${repoPath} ls-remote --exit-code --heads origin ${branch}`, true);
  }
  
  if (opts.dryRun) {
    return false;
  }

  try {
    await execa("git", ["-C", repoPath, "ls-remote", "--exit-code", "--heads", "origin", branch]);
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
