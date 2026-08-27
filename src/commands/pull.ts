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
import { gitExec, localBranchExists, validateSafeBranchName, getWorktreeList, resolveCommitSha } from "../lib/git.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
  resolveMainBranch,
} from "../lib/resolver.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import { runPostCreateSetup } from "../lib/worktree-setup.js";
import { parsePrLink, descriptorFor, detectRepoForge } from "../lib/forge/index.js";
import { recordStackEntry } from "../lib/stack.js";

interface PullOptions {
  repo?: string[];
  force?: boolean;
}

export function registerPullCommand(program: Command) {
  program
    .command("pull <link>")
    .description("Fetch a forge PR and create its worktree")
    .option("-r, --repo <repos...>", "Target specific repo")
    .option("-f, --force", "Override existing local branch/worktree if it exists")
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
        const existingWorktree = worktrees.find((w) => w.path === wtPath || w.branch === branch);
        const localBranchFound = await localBranchExists(target.mainPath, branch, globalOpts);
        const dirExists = Boolean(existingWorktree) || fs.existsSync(wtPath);

        if (localBranchFound || dirExists) {
          if (options.force) {
            stepWarning(
              `Branch '${branch}' already exists — --force: will override`,
              dirExists ? wtPath : "local branch exists"
            );
          } else {
            stepWarning(
              `Branch '${branch}' already exists`,
              dirExists ? wtPath : "local branch exists"
            );
            summaryWarning(`Nothing pulled — branch '${branch}' already exists`);
            return;
          }
        }

        if (options.force && (localBranchFound || dirExists)) {
          if (existingWorktree) {
            try {
              await gitExec(
                ["-C", target.mainPath, "worktree", "remove", "--force", existingWorktree.path],
                { verbose: globalOpts.verbose, dryRun: globalOpts.dryRun }
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              if (!message.includes("not a working tree")) {
                stepWarning("Worktree removal failed", message.split("\n")[0] ?? message);
              }
            }
          }

          if (!globalOpts.dryRun && fs.existsSync(wtPath)) {
            fs.rmSync(wtPath, { recursive: true, force: true });
          }

          if (localBranchFound) {
            try {
              await gitExec(
                ["-C", target.mainPath, "branch", "-D", branch],
                { verbose: globalOpts.verbose, dryRun: globalOpts.dryRun }
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              if (!message.includes("branch not found") && !message.includes("not found")) {
                stepWarning("Branch deletion failed", message.split("\n")[0] ?? message);
              }
            }
          }

          stepSuccess("Existing branch/worktree removed", branch);
        }

        const mainBranch = await resolveMainBranch(target, config);
        const baseRemote = await resolveBaseRemote(target.mainPath, mainBranch);
        const baseBranch = head.baseRefName || mainBranch;
        const baseRef = `${baseRemote}/${baseBranch}`;

        const fetch = adapter.buildHeadFetch(head);
        stepProgress(
          fetch.url
            ? `Fetching ${fetch.refspec} from fork...`
            : `Fetching pull/${head.number}/head from ${baseRemote}...`
        );

        try {
          if (baseBranch !== mainBranch) {
            try {
              await gitExec(
                ["-C", target.mainPath, "fetch", baseRemote, "--", baseBranch],
                { verbose: globalOpts.verbose, dryRun: globalOpts.dryRun }
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              stepWarning("PR base was not fetched", message.split("\n")[0] ?? message);
            }
          }
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
          const createBranchFlag = options.force ? "-B" : "-b";
          await gitExec(
            ["-C", target.mainPath, "worktree", "add", createBranchFlag, branch, wtPath, "FETCH_HEAD"],
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

        if (!globalOpts.dryRun) {
          try {
            const baseSha = await resolveCommitSha(target.mainPath, baseRef, globalOpts);
            const metadataBaseRef = baseBranch === mainBranch ? mainBranch : baseRef;
            await recordStackEntry(target.mainPath, branch, {
              baseRef: metadataBaseRef,
              baseSha,
              explicit: baseBranch !== mainBranch,
              createdAt: new Date().toISOString(),
            }, globalOpts);
            stepSuccess("Base recorded", metadataBaseRef);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            stepWarning("Base metadata not recorded", message);
          }
        }

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
