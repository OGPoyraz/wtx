import { Command } from "commander";
import fs from "fs";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  info,
  stepWarning,
  summary,
  indented,
} from "../lib/log.js";
import { gitExec, getDirtyFiles, detectInProgressRebase } from "../lib/git.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { detectDepsState } from "../lib/deps.js";
import { resolveForge } from "../lib/forge/index.js";
import { derivePrDisplay, type PrInfo } from "../lib/forge/types.js";
import { renderChecksSummary, renderDisplayState } from "../lib/forge/render.js";
import { resolveOwnership, type Ownership } from "../lib/owner.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import chalk from "chalk";

interface StatusOptions {
  repo?: string[];
  json?: boolean;
}

export interface StatusJsonInput {
  repo: string;
  branch: string;
  dirtyFiles: string[];
  ahead: number | null;
  behind: number | null;
  prInfo?: PrInfo;
  ownership?: Ownership | null;
  deps: ReturnType<typeof detectDepsState>;
  rebase: string | null;
}

export function buildStatusJson(item: StatusJsonInput) {
  const entry: Record<string, unknown> = {
    repo: item.repo,
    branch: item.branch,
    clean: item.dirtyFiles.length === 0,
  };
  if (item.dirtyFiles.length > 0) {
    entry.dirtyFiles = item.dirtyFiles;
  }

  if (item.ahead !== null) entry.ahead = item.ahead;
  if (item.behind !== null) entry.behind = item.behind;

  entry.deps = item.deps;

  if (item.prInfo) {
    entry.pr = {
      number: item.prInfo.number,
      state: item.prInfo.state,
      url: item.prInfo.url,
    };
  }

  if (item.ownership && !item.ownership.mine && item.ownership.author) {
    entry.owner = item.ownership.author;
  }

  if (item.rebase) {
    entry.rebase = item.rebase;
  }

  return entry;
}

export function registerStatusCommand(program: Command) {
  program
    .command("status <branch>")
    .description("Show worktree status across repos")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--json", "Output machine-readable JSON")
    .action(async (branch: string, options: StatusOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);
      let found = 0;
      
      const jsonOutputs: Record<string, unknown>[] = [];

      for (const repo of repos) {
        const wtPath = getWorktreePath(repo, branch);
        if (!fs.existsSync(wtPath)) {
          continue;
        }

        found++;
        const dirtyFiles = await getDirtyFiles(wtPath);
        
        let ahead: number | null = null;
        let behind: number | null = null;
        
        try {
          const mainBranch = await resolveMainBranch(repo, config);
          const resolvedRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
          const countOutput = await gitExec(
            ["-C", wtPath, "rev-list", "--left-right", "--count", `${resolvedRemote}/${mainBranch}...HEAD`],
            { verbose: globalOpts.verbose }
          );
          const parts = countOutput.trim().split(/\s+/);
          behind = parts[0] ? parseInt(parts[0], 10) : null;
          ahead = parts[1] ? parseInt(parts[1], 10) : null;
        } catch {
          // Keep as null
        }

        let prInfo: PrInfo | undefined;
        try {
          const forge = resolveForge(repo);
          const prMap = await forge?.findForBranches({
            cwd: repo.mainPath,
            branches: [branch],
            verbose: globalOpts.verbose,
          });
          prInfo = prMap?.get(branch);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!options.json) stepWarning(`PR lookup failed`, message);
        }

        const ownership = await resolveOwnership({
          configUser: config.user,
          mainPath: repo.mainPath,
          branch,
          wtPath,
          prAuthorLogin: prInfo?.authorLogin ?? null,
          verbose: globalOpts.verbose,
        });

        const rebaseStatus = detectInProgressRebase(wtPath);
        const depsState = detectDepsState(wtPath, repo.mainPath);
        
        if (options.json) {
          jsonOutputs.push(buildStatusJson({
            repo: repo.name,
            branch,
            dirtyFiles,
            ahead,
            behind,
            prInfo,
            ownership,
            deps: depsState,
            rebase: rebaseStatus,
          }));
          continue;
        }

        repoHeader(repo.name);
        info(`  Branch:    ${branch}`);

        if (dirtyFiles.length === 0) {
          info(`  Status:    clean`);
        } else {
          info(`  Status:    dirty (${dirtyFiles.length} file${dirtyFiles.length > 1 ? "s" : ""})`);
          for (const f of dirtyFiles) {
            indented(`         ${f}`);
          }
        }

        if (ahead !== null && behind !== null) {
          info(`  vs main:   ${ahead} ahead, ${behind} behind`);
        } else {
          info(`  vs main:   unknown`);
        }

        if (prInfo) {
          const display = derivePrDisplay(prInfo);
          let authorTag = "";
          if (ownership && !ownership.mine && ownership.author) {
            authorTag = ` (by ${chalk.dim(ownership.author)})`;
          }
          info(`  PR:        #${prInfo.number} ${prInfo.state} — ${renderDisplayState(display)}${authorTag}`);

          const threads =
            prInfo.unresolvedThreads > 0
              ? `${prInfo.unresolvedThreads} unresolved thread${prInfo.unresolvedThreads > 1 ? "s" : ""}`
              : null;
          const details = [renderChecksSummary(prInfo.checks), threads]
            .filter(Boolean)
            .join(" · ");
          if (details) {
            info(`             ${details}`);
          }
          info(`             ${prInfo.url}`);
        } else if (ownership && !ownership.mine && ownership.author) {
          info(`  Owner:     ${chalk.dim(ownership.author)}`);
        }

        if (rebaseStatus) {
          info(`  Rebase:    ${rebaseStatus}`);
        }

        info(`  Deps:      ${depsState.strategy}`);
      }

      if (options.json) {
        if (jsonOutputs.length === 1) {
          console.log(JSON.stringify(jsonOutputs[0], null, 2));
        } else {
          console.log(JSON.stringify(jsonOutputs, null, 2));
        }
        return;
      }

      if (found === 0) {
        stepWarning("No worktrees found for this branch");
      } else {
        summary(`Done — ${found} repo${found > 1 ? "s" : ""} checked`);
      }
    });
}
