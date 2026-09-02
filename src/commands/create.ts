import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { GlobalOptions, RepoContext } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  stepProgress,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
  summaryWarning,
  verbose,
} from "../lib/log.js";
import { gitExec, getLatestCommit, getLocalBranchSha, getRemoteBranchSha, getWorktreeList, resolveCommitSha } from "../lib/git.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import { resolveBranchTarget } from "../lib/branch-resolution.js";
import { recordStackEntry } from "../lib/stack.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { resolveIde, spawnIde } from "../lib/ide.js";
import { runPostCreateSetup } from "../lib/worktree-setup.js";
import { switchToInstall, switchToSymlink } from "../lib/deps.js";
import { resolveForge } from "../lib/forge/index.js";
import { resolveOwnership, type Ownership } from "../lib/owner.js";
import { resolveAgentCommand, listAvailableAgents, spawnAgentInWorktree } from "../lib/agents.js";

export interface CreateOptions {
  repo?: string[];
  base?: string;
  open?: boolean;
  ide?: string;
  track?: boolean;
  local?: boolean;
  agent?: string;
  prompt?: string;
  deps?: string;
}

const DEPS_STRATEGIES = ["auto", "link", "symlink", "install", "off"] as const;

export interface CreateWorktreeResult {
  ok: boolean;
  skipped: boolean;
  wtPath: string;
  hookFailed: boolean;
  depsFailed: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function applyDepsStrategy(
  strategy: string,
  wtPath: string,
  mainPath: string,
  opts: GlobalOptions
): Promise<boolean> {
  if (strategy === "install") {
    return switchToInstall(wtPath, opts);
  }
  if (strategy === "symlink") {
    await switchToSymlink(wtPath, mainPath, opts);
    return true;
  }
  return true;
}

async function fetchPrAuthorLogin(
  repo: RepoContext,
  branch: string,
  verboseFlag: boolean
): Promise<string | null> {
  try {
    const forge = resolveForge(repo);
    if (!forge) return null;
    const prMap = await forge.findForBranches({
      cwd: repo.mainPath,
      branches: [branch],
      verbose: verboseFlag,
    });
    return prMap.get(branch)?.authorLogin ?? null;
  } catch (err) {
    verbose(`PR author lookup skipped: ${err instanceof Error ? err.message : String(err)}`, verboseFlag);
    return null;
  }
}

export async function createWorktreeForRepo(params: {
  config: ReturnType<typeof loadConfig>;
  repo: RepoContext;
  branch: string;
  options: Pick<CreateOptions, "base" | "track" | "local" | "deps">;
  globalOpts: GlobalOptions;
}): Promise<CreateWorktreeResult> {
  const { config, repo, branch, options, globalOpts } = params;
  const wtPath = getWorktreePath(repo, branch);
  let hookFailed = false;
  let depsFailed = false;

  const wts = await getWorktreeList(repo.mainPath);
  if (wts.some(wt => wt.path === wtPath)) {
    stepWarning("Worktree already exists", `${wtPath} (skipped)`);
    return { ok: false, skipped: true, wtPath, hookFailed, depsFailed };
  }

  const mainBranch = await resolveMainBranch(repo, config);
  const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);

  if (repo.config.fetch_main_on_create) {
    stepProgress(`Fetching ${resolvedRemote}/${mainBranch}...`);
    await gitExec(["-C", repo.mainPath, "fetch", resolvedRemote, "--", mainBranch], globalOpts);
    const commit = await getLatestCommit(repo.mainPath, `${resolvedRemote}/${mainBranch}`);
    stepSuccess(`Fetched ${resolvedRemote}/${mainBranch}`, `${commit.hash} "${commit.subject}"`);
  }

  stepProgress("Checking branch status...");
  const baseRef = options.base || `${resolvedRemote}/${mainBranch}`;
  if (baseRef === branch || baseRef === `refs/heads/${branch}`) {
    throw new Error(`Base ref '${baseRef}' cannot be the new branch '${branch}'`);
  }

  let baseSha: string | null = null;
  if (!globalOpts.dryRun) {
    baseSha = await resolveCommitSha(repo.mainPath, baseRef, globalOpts);
    stepSuccess("Base resolved", `${baseRef} at ${baseSha.substring(0, 7)}`);
  } else {
    stepProgress("Using base", baseRef);
  }

  if (!globalOpts.dryRun) {
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  }

  const localSha = await getLocalBranchSha(repo.mainPath, branch, globalOpts);
  const remoteSha = await getRemoteBranchSha(repo.mainPath, resolvedRemote, branch, globalOpts);

  const localExists = localSha !== null;
  const remoteExists = remoteSha !== null;

  const target = resolveBranchTarget({ localExists, localSha, remoteExists, remoteSha });

  let ownership: Ownership | null = null;
  if (remoteExists && !options.track && target.kind !== "diverged") {
    const prAuthorLogin = await fetchPrAuthorLogin(repo, branch, globalOpts.verbose);
    ownership = await resolveOwnership({
      configUser: config.user,
      mainPath: repo.mainPath,
      branch,
      prAuthorLogin,
      verbose: globalOpts.verbose,
    });

    if (ownership && !ownership.mine) {
      stepWarning(
        `Remote branch ${branch} belongs to ${ownership.author}`,
        `creating your own from ${baseRef} instead — use --track to track theirs`
      );
    }
  } else if (remoteExists && options.track) {
    verbose(`Tracking forced via --track`, globalOpts.verbose);
  }

  const resolvedAction = (ownership && !ownership.mine) ? { kind: "create-new" as const } : target;

  try {
    if (resolvedAction.kind === "create-new") {
      verbose(`Creating ${branch} from ${baseRef}`, globalOpts.verbose);
      await gitExec(["-C", repo.mainPath, "worktree", "add", "-b", branch, wtPath, baseRef], globalOpts);
    } else if (resolvedAction.kind === "use-local") {
      verbose(`Using existing local branch ${branch}`, globalOpts.verbose);
      await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
    } else if (resolvedAction.kind === "track-remote") {
      if (localExists) {
        stepSuccess("Using existing tracking branch", branch);
        await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
      } else {
        stepSuccess(
          ownership ? "Tracking your remote branch" : "Tracking existing remote branch",
          branch
        );
        await gitExec(["-C", repo.mainPath, "worktree", "add", "--track", "-b", branch, wtPath, `${resolvedRemote}/${branch}`], globalOpts);
      }
    } else if (resolvedAction.kind === "diverged") {
      if (options.track) {
        stepSuccess("Tracking forced over diverged local branch", branch);
        await gitExec(["-C", repo.mainPath, "worktree", "add", "-B", branch, wtPath, `${resolvedRemote}/${branch}`], globalOpts);
      } else if (options.local) {
        stepSuccess("Local forced over diverged remote branch", branch);
        await gitExec(["-C", repo.mainPath, "worktree", "add", wtPath, branch], globalOpts);
      } else {
        const shortLocal = localSha!.substring(0, 7);
        const shortRemote = remoteSha!.substring(0, 7);
        throw new Error(`Branch diverged: local (${shortLocal}) differs from remote (${shortRemote}). Use --track to overwrite local or --local to ignore remote.`);
      }
    }
  } catch (err: unknown) {
    const message = errorMessage(err);
    if (message.includes("already exists") || message.includes("not a working tree")) {
      stepWarning("Worktree collision", `${wtPath} (skipped due to git error)`);
      return { ok: false, skipped: true, wtPath, hookFailed, depsFailed };
    }
    throw err;
  }

  stepSuccess("Worktree created", wtPath);

  if (!globalOpts.dryRun && baseSha && resolvedAction.kind === "create-new") {
    try {
      const metadataBaseRef = options.base ? baseRef : mainBranch;
      await recordStackEntry(repo.mainPath, branch, {
        baseRef: metadataBaseRef,
        baseSha,
        explicit: options.base !== undefined,
        createdAt: new Date().toISOString(),
      }, globalOpts);
      stepSuccess("Base recorded", metadataBaseRef);
    } catch (err: unknown) {
      stepWarning("Base metadata not recorded", errorMessage(err));
    }
  }

  const setupResult = await runPostCreateSetup({ config, repo, wtPath, branch, globalOpts });

  if (options.deps && options.deps !== "auto" && options.deps !== "link" && options.deps !== "off") {
    const ok = await applyDepsStrategy(options.deps, wtPath, repo.mainPath, globalOpts);
    if (!ok) depsFailed = true;
  }

  const failedHooks = setupResult.hooks.filter(h => !h.ok);
  if (failedHooks.length > 0) {
    const hookMsgs = failedHooks.map(h => `  - ${h.command} (exit code: ${h.exitCode})`).join("\n");
    stepError("Hook failures", `Some hooks failed:\n${hookMsgs}\nRe-run via: wtx sync ${branch}`);
    hookFailed = true;
  }

  return { ok: !hookFailed && !depsFailed, skipped: false, wtPath, hookFailed, depsFailed };
}

export function registerCreateCommand(program: Command) {
  program
    .command("create <branch>")
    .description("Create worktree(s)")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--base <ref>", "Base ref to create branch from")
    .option("-o, --open", "Open worktree(s) in IDE after creation")
    .option("--ide <editor>", "IDE to open with (used with --open)")
    .option("--track", "Track existing remote branch even if owned by someone else")
    .option("--local", "Use local branch even if diverged from remote")
    .option("--agent <name>", "Spawn a coding agent in the new worktree")
    .option("--prompt <text>", "Prompt to pass to the coding agent")
    .option("--deps <strategy>", `Dependency strategy for the new worktree: ${DEPS_STRATEGIES.join("|")}`)
    .action(async (branch: string, options: CreateOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();

      if (options.deps && !DEPS_STRATEGIES.includes(options.deps as (typeof DEPS_STRATEGIES)[number])) {
        stepError(`Invalid --deps strategy: ${options.deps}`, `Expected one of: ${DEPS_STRATEGIES.join(", ")}`);
        process.exit(1);
      }

      let agentCmd: string | null = null;
      if (options.agent) {
        agentCmd = resolveAgentCommand(options.agent, config.agents);
        if (!agentCmd) {
          const available = listAvailableAgents(config.agents).join(", ");
          stepError(`Unknown agent: ${options.agent}`, `Available: ${available}`);
          process.exit(1);
        }
      } else if (options.prompt) {
        stepError("--prompt requires --agent");
        process.exit(1);
      }

      const repoFilter = parseRepoFlag(options.repo);

      const ide = options.open ? resolveIde(options.ide, config) : undefined;
      if (options.open && !ide) {
        stepWarning("No IDE configured", "Set via --ide, config, or $EDITOR");
      }

      const openWorktree = (wtPath: string) => {
        if (!ide) return;

        if (globalOpts.dryRun) {
          stepWarning(`Would open in ${ide}`, wtPath);
          return;
        }

        spawnIde(ide, wtPath);
        stepSuccess(`Opened in ${ide}`, wtPath);
      };

      const repos = resolveRepos(config, repoFilter);
      let successCount = 0;
      let skipCount = 0;
      let hookFailures = false;
      let depsFailed = false;

      for (const repo of repos) {
        repoHeader(repo.name);
        
        try {
          const result = await createWorktreeForRepo({ config, repo, branch, options, globalOpts });

          if (result.skipped) {
            skipCount++;
            openWorktree(result.wtPath);
            continue;
          }

          hookFailures = hookFailures || result.hookFailed;
          depsFailed = depsFailed || result.depsFailed;

          if (hookFailures || depsFailed) {
            stepWarning("Skipping IDE open and agent spawn", `worktree has failures — fix with 'wtx sync ${branch}' or 'wtx deps ${branch} --install' first`);
          } else {
            openWorktree(result.wtPath);
          }

          if (agentCmd && !hookFailures) {
            try {
              if (globalOpts.dryRun) {
                stepProgress("Would spawn agent", options.agent);
              } else {
                stepProgress(`Spawning agent: ${options.agent}...`);
              }
              const agentRes = await spawnAgentInWorktree(agentCmd, result.wtPath, {
                prompt: options.prompt,
                dryRun: globalOpts.dryRun,
                branch,
                repoName: repo.name
              });
              if (agentRes.mode === "tmux" && agentRes.session) {
                stepSuccess("Agent spawned in tmux", `tmux attach -t ${agentRes.session}`);
              } else {
                stepSuccess("Agent spawned directly");
              }
            } catch {
              stepWarning("Failed to spawn agent", "binary may not be installed");
            }
          }

          successCount++;
        } catch (err: unknown) {
          stepError("Failed to create worktree", errorMessage(err));
        }
      }

      if (successCount === 0 && skipCount === 0) {
        summaryWarning("No worktrees created");
      } else if (skipCount > 0) {
        summaryWarning(`Done — ${successCount} created, ${skipCount} skipped`);
      } else {
        summary(`Done — ${successCount} worktrees created`);
      }

      if (hookFailures || depsFailed) {
        process.exit(1);
      }
    });
}
