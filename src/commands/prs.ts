import { Command } from "commander";
import chalk from "chalk";
import type { Config, GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import { repoHeader, stepWarning, summary, summaryWarning } from "../lib/log.js";
import { getWorktreeList } from "../lib/git.js";
import { resolveRepos, parseRepoFlag } from "../lib/resolver.js";
import { resolveForge } from "../lib/forge/index.js";
import { resolveOwnership, type Ownership } from "../lib/owner.js";
import {
  derivePrDisplay,
  displayStateRank,
  PR_DISPLAY_STATES,
  type PrDisplay,
  type PrDisplayState,
} from "../lib/forge/types.js";
import {
  formatRelativeTime,
  renderChecksSummary,
  renderDisplayState,
} from "../lib/forge/render.js";

const ATTENTION_STATES = new Set<PrDisplayState>([
  PR_DISPLAY_STATES.CONFLICTED,
  PR_DISPLAY_STATES.CI_FAILING,
  PR_DISPLAY_STATES.CHANGES_REQUESTED,
]);

const HIDDEN_BY_DEFAULT = new Set<PrDisplayState>([
  PR_DISPLAY_STATES.DRAFT,
  PR_DISPLAY_STATES.CLOSED,
  PR_DISPLAY_STATES.MERGED,
]);

interface PrRow {
  repo: string;
  branch: string;
  worktree: string;
  prNumber: number;
  url: string;
  prDisplay: PrDisplay;
  checksSummary: string | null;
  unresolvedThreads: number;
  updatedAt: string;
  authorLogin: string | null;
  ownership: Ownership | null;
}

interface PrsOptions {
  repo?: string[];
  json?: boolean;
  all?: boolean;
}

function isVisible(row: PrRow, includeAll: boolean): boolean {
  return includeAll || !HIDDEN_BY_DEFAULT.has(row.prDisplay.primary);
}

function sortRows(rows: PrRow[]): void {
  rows.sort((a, b) => {
    const rankDiff = displayStateRank(a.prDisplay.primary) - displayStateRank(b.prDisplay.primary);
    if (rankDiff !== 0) return rankDiff;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

async function collectPrRows(
  repos: ReturnType<typeof resolveRepos>,
  config: Config,
  verboseFlag: boolean
): Promise<{ rows: PrRow[]; failures: number }> {
  const rows: PrRow[] = [];
  let failures = 0;

  for (const repo of repos) {
    const forge = resolveForge(repo);
    if (!forge) continue;

    try {
      const worktrees = await getWorktreeList(repo.mainPath);
      const branches = worktrees
        .filter((wt) => wt.path !== repo.mainPath && wt.branch)
        .map((wt) => wt.branch);

      if (branches.length === 0) continue;

      const prMap = await forge.findForBranches({
        cwd: repo.mainPath,
        branches,
        verbose: verboseFlag,
      });

      for (const [branch, pr] of prMap) {
        const worktreePath = worktrees.find((wt) => wt.branch === branch)?.path ?? "";
        const ownership = await resolveOwnership({
          configUser: config.user,
          mainPath: repo.mainPath,
          branch,
          wtPath: worktreePath || undefined,
          prAuthorLogin: pr.authorLogin ?? null,
          verbose: verboseFlag,
        });

        rows.push({
          repo: repo.name,
          branch,
          worktree: worktreePath,
          prNumber: pr.number,
          url: pr.url,
          prDisplay: derivePrDisplay(pr),
          checksSummary: renderChecksSummary(pr.checks),
          unresolvedThreads: pr.unresolvedThreads,
          updatedAt: pr.updatedAt,
          authorLogin: pr.authorLogin ?? null,
          ownership,
        });
      }
    } catch (err) {
      failures++;
      const message = err instanceof Error ? err.message : String(err);
      stepWarning(`PR lookup failed for ${repo.name}`, message);
    }
  }

  return { rows, failures };
}

function renderTable(rows: PrRow[]): void {
  const byRepo = new Map<string, PrRow[]>();
  for (const row of rows) {
    const list = byRepo.get(row.repo) ?? [];
    list.push(row);
    byRepo.set(row.repo, list);
  }

  for (const [repoName, repoRows] of byRepo) {
    repoHeader(repoName);
    const maxBranchLen = Math.max(...repoRows.map((row) => row.branch.length));

    for (const row of repoRows) {
      const paddedBranch = row.branch.padEnd(maxBranchLen + 2);
      const threads =
        row.unresolvedThreads > 0
          ? `${row.unresolvedThreads} thread${row.unresolvedThreads > 1 ? "s" : ""}`
          : null;
      const details = [row.checksSummary, threads].filter(Boolean).join(" · ");
      const detailSuffix = details ? `  ${details}` : "";

      const authorTag =
        row.ownership && !row.ownership.mine && row.ownership.author
          ? `  ${chalk.dim(row.ownership.author)}`
          : "";

      console.log(
        `  #${row.prNumber}  ${paddedBranch} ${renderDisplayState(row.prDisplay)}${detailSuffix}${authorTag}  ${formatRelativeTime(row.updatedAt)}  ${chalk.dim(row.url)}`
      );
    }
  }
}

function toJsonOutput(rows: PrRow[]): unknown[] {
  return rows.map((row) => ({
    repo: row.repo,
    branch: row.branch,
    worktree: row.worktree,
    display: row.prDisplay.primary,
    awaitingReview: row.prDisplay.awaitingReview,
    approved: row.prDisplay.approved,
    prNumber: row.prNumber,
    author: row.authorLogin,
  }));
}

export function registerPrsCommand(program: Command) {
  program
    .command("prs")
    .description("Show pull request status across worktrees")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--json", "Output machine-readable JSON")
    .option("--all", "Include drafts and closed/merged PRs")
    .action(async (options: PrsOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);

      const { rows, failures } = await collectPrRows(repos, config, globalOpts.verbose);
      sortRows(rows);

      if (options.json) {
        const visible = rows.filter((row) => isVisible(row, options.all === true));
        console.log(JSON.stringify(toJsonOutput(visible), null, 2));
        return;
      }

      const visible = rows.filter((row) => isVisible(row, options.all === true));

      if (visible.length === 0 && failures === 0) {
        summary("No open pull requests found");
        return;
      }

      renderTable(visible);

      const attentionCount = visible.filter((row) =>
        ATTENTION_STATES.has(row.prDisplay.primary)
      ).length;
      const repoCount = new Set(visible.map((row) => row.repo)).size;

      if (visible.length === 0) {
        return;
      }

      const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
      const noun = options.all ? "PR" : "open PR";
      let line = `${plural(visible.length, noun)} across ${plural(repoCount, "repo")}`;

      let mineCount = 0;
      let theirsCount = 0;
      const theirsAuthors = new Set<string>();
      for (const row of visible) {
        if (row.ownership) {
          if (row.ownership.mine) {
            mineCount++;
          } else if (row.ownership.author) {
            theirsCount++;
            theirsAuthors.add(row.ownership.author);
          }
        }
      }

      if (theirsCount > 0) {
        const handles = Array.from(theirsAuthors).join(", ");
        line += ` (${mineCount} yours, ${theirsCount} from ${handles})`;
      }

      if (attentionCount > 0) {
        summaryWarning(
          `${line} — ${attentionCount} need${attentionCount > 1 ? "" : "s"} attention`
        );
      } else {
        summary(line);
      }
    });
}
