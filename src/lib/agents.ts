import { execa } from "execa";
import type { AgentConfig } from "../types.js";

export const DEFAULT_AGENTS: Record<string, string> = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
  cursor: "cursor",
};

export function resolveAgentCommand(
  name: string,
  configured?: Record<string, AgentConfig>
): string | null {
  return configured?.[name]?.command ?? DEFAULT_AGENTS[name] ?? null;
}

export function listAvailableAgents(configured?: Record<string, AgentConfig>): string[] {
  return [...new Set([...Object.keys(DEFAULT_AGENTS), ...Object.keys(configured ?? {})])];
}

export interface SpawnAgentResult {
  mode: "tmux" | "direct";
  session?: string;
}

let tmuxAvailable: boolean | undefined = undefined;

async function isTmuxAvailable(): Promise<boolean> {
  if (tmuxAvailable !== undefined) return tmuxAvailable;
  try {
    await execa("tmux", ["-V"]);
    tmuxAvailable = true;
  } catch {
    tmuxAvailable = false;
  }
  return tmuxAvailable;
}

export function tmuxSessionName(repoName: string, branch: string): string {
  const sanitized = `${repoName}-${branch}`.replace(/[\/.:]/g, "-");
  return `wtx-${sanitized}`.substring(0, 60);
}

export function buildTmuxArgs(session: string, wtPath: string, cmd: string): string[] {
  return ["new-session", "-d", "-s", session, "-c", wtPath, cmd];
}

export async function spawnAgentInWorktree(
  commandTemplate: string,
  wtPath: string,
  opts: { prompt?: string; dryRun?: boolean; branch?: string; repoName?: string } = {}
): Promise<SpawnAgentResult> {
  const cmd = buildAgentCommand(commandTemplate, wtPath, opts.prompt, {
    branch: opts.branch,
    repo: opts.repoName
  });

  const session = (opts.repoName && opts.branch) 
    ? tmuxSessionName(opts.repoName, opts.branch) 
    : undefined;

  if (opts.dryRun) {
    if (session && await isTmuxAvailable()) {
      return { mode: "tmux", session };
    }
    return { mode: "direct" };
  }

  if (session && await isTmuxAvailable()) {
    try {
      const args = buildTmuxArgs(session, wtPath, cmd);
      await execa("tmux", args, { stdio: "inherit" });
      return { mode: "tmux", session };
    } catch {
      // Fallback to direct on failure
    }
  }

  await execa(cmd, { shell: true, cwd: wtPath, stdio: "inherit" });
  return { mode: "direct" };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\''`)}'`;
}

export function buildAgentCommand(
  commandTemplate: string,
  wtPath: string,
  prompt?: string,
  vars?: { branch?: string; repo?: string }
): string {
  let cmd = commandTemplate.replaceAll("{wt}", shellQuote(wtPath));
  if (vars?.branch) {
    cmd = cmd.replaceAll("{branch}", shellQuote(vars.branch));
  }
  if (vars?.repo) {
    cmd = cmd.replaceAll("{repo}", shellQuote(vars.repo));
  }
  if (prompt) {
    cmd += ` ${shellQuote(prompt)}`;
  }
  return cmd;
}
