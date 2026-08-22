import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import {
  repoHeader,
  info,
  stepWarning,
  summary,
  indented,
} from "../lib/log.js";
import { gitExec, getDirtyFiles } from "../lib/git.js";
import {
  resolveRepos,
  resolveMainBranch,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { detectDepsState } from "../lib/deps.js";
import { resolveForge } from "../lib/forge/index.js";
import { derivePrDisplay } from "../lib/forge/types.js";
import { renderChecksSummary, renderDisplayState } from "../lib/forge/render.js";

interface StatusOptions {
  repo?: string[];
}

function detectInProgressRebase(wtPath: string): string | null {
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
  } catch {
  }

  return null;
}

export function registerStatusCommand(program: Command) {
  program
    .command("status <branch>")
    .description("Show worktree status across repos")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .action(async (branch: string, options: StatusOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);
      let found = 0;

      for (const repo of repos) {
        const wtPath = getWorktreePath(repo, branch);
        if (!fs.existsSync(wtPath)) {
          continue;
        }

        found++;
        repoHeader(repo.name);

        info(`  Branch:    ${branch}`);

        const dirtyFiles = await getDirtyFiles(wtPath);
        if (dirtyFiles.length === 0) {
          info(`  Status:    clean`);
        } else {
          info(`  Status:    dirty (${dirtyFiles.length} file${dirtyFiles.length > 1 ? "s" : ""})`);
          for (const f of dirtyFiles) {
            indented(`         ${f}`);
          }
        }

        try {
          const mainBranch = await resolveMainBranch(repo, config);
          const countOutput = await gitExec(
            ["-C", wtPath, "rev-list", "--left-right", "--count", `origin/${mainBranch}...HEAD`],
            { verbose: globalOpts.verbose }
          );
          const parts = countOutput.trim().split(/\s+/);
          const behind = parts[0] ?? "0";
          const ahead = parts[1] ?? "0";
          info(`  vs main:   ${ahead} ahead, ${behind} behind`);
        } catch {
          info(`  vs main:   unknown`);
        }

        try {
          const forge = resolveForge(repo);
          const prMap = await forge?.findForBranches({
            cwd: repo.mainPath,
            branches: [branch],
            verbose: globalOpts.verbose,
          });
          const prInfo = prMap?.get(branch);

          if (prInfo) {
            const display = derivePrDisplay(prInfo);
            info(`  PR:        #${prInfo.number} ${prInfo.state} — ${renderDisplayState(display)}`);

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
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          stepWarning(`PR lookup failed`, message);
        }

        const rebaseStatus = detectInProgressRebase(wtPath);
        if (rebaseStatus) {
          info(`  Rebase:    ${rebaseStatus}`);
        }

        const depsState = detectDepsState(wtPath, repo.mainPath);
        info(`  Deps:      ${depsState.strategy}`);
      }

      if (found === 0) {
        stepWarning("No worktrees found for this branch");
      } else {
        summary(`Done — ${found} repo${found > 1 ? "s" : ""} checked`);
      }
    });
}
