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
} from "../lib/log.js";
import { gitExec, localBranchExists, validateSafeBranchName } from "../lib/git.js";
import {
  resolveRepos,
  getWorktreePath,
  parseRepoFlag,
} from "../lib/resolver.js";
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
          if (config.repos[name]!.pr === false) continue;

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
          stepError(`Failed to fetch PR #${ref.number}`, err.message);
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
        const remoteBranchFound = await localBranchExists(target.mainPath, branch, globalOpts);
        const dirExists = fs.existsSync(wtPath);

        if (remoteBranchFound || dirExists) {
          stepWarning(
            `Branch '${branch}' already exists`,
            dirExists ? wtPath : "local branch exists"
          );
          summaryWarning(`Nothing pulled — branch '${branch}' already exists`);
          return;
        }

        const fetch = adapter.buildHeadFetch(head);
        stepProgress(
          fetch.url
            ? `Fetching ${fetch.refspec} from fork...`
            : `Fetching pull/${head.number}/head from origin...`
        );

        try {
          await gitExec(
            [
              "-C",
              target.mainPath,
              "fetch",
              ...(fetch.url ? [fetch.url] : ["origin"]),
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

        await gitExec(
          ["-C", target.mainPath, "worktree", "add", "-b", branch, wtPath, "FETCH_HEAD"],
          { verbose: globalOpts.verbose, dryRun: globalOpts.dryRun }
        );

        stepSuccess("Worktree created", wtPath);

        await runPostCreateSetup({ config, repo: target, wtPath, branch, globalOpts });

        summary(`Done — pulled #${head.number} "${head.title}" into ${branch}`);
      } catch (err: any) {
        stepError("Failed to pull", err.message);
        process.exit(1);
      }
    });
}
