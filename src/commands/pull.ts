import { Command } from "commander";
import fs from "fs";
import path from "path";
import type { RepoContext, GlobalOptions } from "../types.js";
import { loadConfig, expandTilde } from "../lib/config.js";
import {
  repoHeader,
  stepProgress,
  stepSuccess,
  stepWarning,
  stepError,
  summary,
  summaryWarning,
  error,
  verbose,
  indented,
} from "../lib/log.js";
import { gitExec, localBranchExists, validateSafeBranchName, getWorktreeList } from "../lib/git.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import { runPostCreateSetup } from "../lib/worktree-setup.js";
import { parsePrLink, descriptorFor, detectRepoForge } from "../lib/forge/index.js";

interface PullOptions {
  repo?: string[];
}

export function registerPullCommand(program: Command) {
  program
    .command("pull <link>")
    .description("Fetch a forge PR and create its worktree")
    .option("-r, --repo <repos...>", "Target specific repo")
    .action(async (link: string, options: PullOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);

      const ref = parsePrLink(link.trim());
      if (!ref) {
        error(`Invalid PR link: expected https://github.com/{owner}/{repo}/pull/{N}`);
        process.exit(1);
      }

      const desc = descriptorFor(ref.forgeId);
      if (!desc || !desc.ownsHost(ref.host)) {
        error(`Unsupported PR link host '${ref.host}' — only github.com URLs are supported`);
        process.exit(1);
      }

      let target: RepoContext;
      if (!repoFilter || repoFilter.length === 0) {
        const candidates = [];
        for (const name of Object.keys(config.repos).sort()) {
          if (config.repos[name]!.check_prs === false) continue;

          const mainPath = path.join(expandTilde(config.root), name);
          const detected = detectRepoForge(mainPath);
          if (!detected) continue;

          if (detected.slug.path === ref.path) {
            candidates.push({ name, host: detected.slug.host });
          }
        }

        if (candidates.length === 0) {
          error(`Repo '${ref.path}' not found in wtx config — run 'wtx config add-repo' to add it first`);
          process.exit(1);
        }

        let pickedName: string;
        if (candidates.length > 1) {
          const exact = candidates.filter((c) => c.host.toLowerCase() === ref.host.toLowerCase());
          if (exact.length === 1) {
            verbose(
              `Multiple repos match '${ref.path}'; picked '${exact[0]!.name}' by exact host match`,
              globalOpts.verbose
            );
            pickedName = exact[0]!.name;
          } else if (exact.length > 1) {
            const names = exact.map((c) => c.name);
            error(`Multiple repos match '${ref.path}': ${names.join(", ")} — specify one with --repo`);
            process.exit(1);
          } else {
            const names = candidates.map((c) => c.name);
            error(`Multiple repos match '${ref.path}': ${names.join(", ")} — specify one with --repo`);
            process.exit(1);
          }
        } else {
          if (candidates[0]!.host.toLowerCase() !== ref.host.toLowerCase()) {
            verbose(
              `Host mismatch tolerated: repo uses '${candidates[0]!.host}' but link is '${ref.host}'`,
              globalOpts.verbose
            );
          }
          pickedName = candidates[0]!.name;
        }

        try {
          target = resolveRepos(config, [pickedName])[0]!;
        } catch (err: any) {
          error(err.message);
          process.exit(1);
        }
      } else {
        let repos;
        try {
          repos = resolveRepos(config, repoFilter);
        } catch (err: any) {
          error(err.message);
          process.exit(1);
        }

        target = repos[0]!;
        const detected = detectRepoForge(target.mainPath);
        if (!detected || detected.slug.path !== ref.path) {
          error(
            `PR belongs to '${ref.path}' but repo '${target.name}' points at ${
              detected ? detected.slug.path : "an unrecognized remote"
            }`
          );
          process.exit(1);
        }
      }

      repoHeader(target.name);
      try {
        stepProgress(`Looking up PR #${ref.number} in ${ref.path}...`);

        const slug = { host: ref.host, path: ref.path };
        const adapter = desc.createAdapter(slug);
        if (!adapter) {
          stepError("Forge unavailable", "Cannot create adapter for this slug");
          process.exit(1);
        }

        let head;
        try {
          head = await adapter.fetchPrHead(ref.number, {
            verbose: globalOpts.verbose,
          });
        } catch (err: any) {
          let msg = err.message || "";
          if (msg.includes("gh: command not found") || msg.includes("ENOENT")) {
            msg = "gh cli not found. install gh via brew";
          } else if (msg.includes("gh auth login") || msg.includes("authentication") || msg.includes("not logged in") || msg.includes("Bad credentials")) {
            msg = "Not authenticated. run `gh auth login`";
          }
          stepError(`Failed to fetch PR #${ref.number}`, msg);
          process.exit(1);
        }

        stepSuccess(
          `PR #${head.number}: ${head.title}`,
          head.state + (head.isDraft ? " · draft" : "")
        );

        if (head.state === "merged") {
          stepWarning(`PR #${head.number} is merged`, "continuing anyway");
        } else if (head.state === "closed") {
          stepWarning(`PR #${head.number} is closed`, "continuing anyway");
        }

        const branch = head.headRefName;
        if (!validateSafeBranchName(branch)) {
          stepError(`Unsafe branch name from PR: '${branch}'`);
          process.exit(1);
        }

        const wtPath = getWorktreePath(target, branch);
        const worktrees = await getWorktreeList(target.mainPath);
        const localBranchFound = await localBranchExists(target.mainPath, branch, globalOpts);
        const dirExists = worktrees.some((w) => w.path === wtPath || w.branch === branch);

        if (localBranchFound || dirExists) {
          stepWarning(
            `Branch '${branch}' already exists`,
            dirExists ? wtPath : "local branch exists"
          );
          summaryWarning(`Nothing pulled — branch '${branch}' already exists`);
          return;
        }

        const baseRemote = await resolveBaseRemote(target.mainPath, target.config.main_branch === "auto" ? config.default_main_branch : target.config.main_branch);

        const fetch = adapter.buildHeadFetch(head);
        stepProgress(
          fetch.url
            ? `Fetching ${fetch.refspec} from fork...`
            : `Fetching pull/${head.number}/head from ${baseRemote}...`
        );

        try {
          await gitExec(
            [
              "-C",
              target.mainPath,
              "fetch",
              ...(fetch.url ? [fetch.url] : [baseRemote]),
              fetch.refspec,
            ],
            { verbose: globalOpts.verbose, dryRun: globalOpts.dryRun }
          );
        } catch (err: any) {
          stepError(`Failed to fetch PR head`, err.message);
          process.exit(1);
        }

        stepSuccess("Fetched");

        if (!globalOpts.dryRun) {
          fs.mkdirSync(path.dirname(wtPath), { recursive: true });
        }

        try {
          await gitExec(
            ["-C", target.mainPath, "worktree", "add", "-b", branch, wtPath, "FETCH_HEAD"],
            { verbose: globalOpts.verbose, dryRun: globalOpts.dryRun }
          );
        } catch (err: any) {
          const msg = err.message || "";
          if (msg.includes("already exists") || msg.includes("not a working tree")) {
            stepWarning(`Worktree or branch already exists`, wtPath);
            summaryWarning(`Nothing pulled — branch '${branch}' already exists`);
            return;
          }
          throw err;
        }

        stepSuccess("Worktree created", wtPath);

        const setupResult = await runPostCreateSetup({ config, repo: target, wtPath, branch, globalOpts });
        const failedHooks = setupResult.hooks.filter((h) => !h.ok);
        if (failedHooks.length > 0) {
          stepError("Pull failed", "One or more post-create hooks failed");
          for (const failed of failedHooks) {
            indented(`- ${failed.command}`);
          }
          indented(`Re-run via: wtx sync ${branch}`);
          process.exit(1);
        }

        summary(`Done — pulled #${head.number} "${head.title}" into ${branch}`);
      } catch (err: any) {
        stepError("Failed to pull", err.message);
        process.exit(1);
      }
    });
}
