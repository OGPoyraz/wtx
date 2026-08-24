import type { Config, RepoContext } from "../types.js";
import { expandTilde } from "./config.js";
import { gitExec } from "./git.js";
import fs from "fs";
import path from "path";
import { stepWarning } from "./log.js";

export function detectRepoFromCwd(config: Config): string | undefined {
  const cwd = process.cwd();
  const root = expandTilde(config.root);

  for (const name of Object.keys(config.repos)) {
    const mainPath = path.join(root, name);
    const wtRoot = path.join(root, `${name}${config.postfix}`);

    if (cwd === mainPath || cwd.startsWith(mainPath + path.sep)) {
      return name;
    }
    if (cwd === wtRoot || cwd.startsWith(wtRoot + path.sep)) {
      return name;
    }
  }

  return undefined;
}

export function warnIfNoRepos(repos: RepoContext[], opts: { quiet?: boolean } = {}): void {
  if (repos.length > 0 || opts.quiet) return;
  stepWarning(
    "No repositories configured",
    "run 'wtx config init' for guided setup, or 'wtx config add-repo <name>'"
  );
}

export function resolveRepos(config: Config, repoFilter?: string[]): RepoContext[] {
  const allRepos = Object.keys(config.repos);
  let targetRepos = allRepos;

  if (repoFilter && repoFilter.length > 0) {
    targetRepos = repoFilter.filter((r) => {
      if (!allRepos.includes(r)) {
        throw new Error(`Repo '${r}' not found in config`);
      }
      return true;
    });
  } else {
    const detectedRepo = detectRepoFromCwd(config);
    if (detectedRepo) {
      targetRepos = [detectedRepo];
    }
  }

  return targetRepos.map((name) => {
    const mainPath = `${expandTilde(config.root)}/${name}`;
    const wtRoot = `${expandTilde(config.root)}/${name}${config.postfix}`;

    if (!fs.existsSync(mainPath)) {
      throw new Error(`Repo directory not found at ${mainPath}`);
    }
    
    const gitDir = path.join(mainPath, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new Error(`Not a git repository: ${mainPath}`);
    }

    return {
      name,
      mainPath,
      wtRoot,
      config: config.repos[name]!,
    };
  });
}

export async function resolveMainBranch(repoCtx: RepoContext, config: Config): Promise<string> {
  if (repoCtx.config.main_branch !== "auto") {
    return repoCtx.config.main_branch;
  }

  try {
    const stdout = await gitExec(["-C", repoCtx.mainPath, "symbolic-ref", "refs/remotes/origin/HEAD"]);
    const prefix = "refs/remotes/origin/";
    const branchName = stdout.trim();
    
    if (branchName.startsWith(prefix)) {
      return branchName.substring(prefix.length);
    }
  } catch (err) {
  }

  return config.default_main_branch;
}

export function getWorktreePath(repoCtx: RepoContext, branch: string): string {
  return `${repoCtx.wtRoot}/${branch}`;
}

export function parseRepoFlag(repoFlag: string[] | undefined): string[] | undefined {
  if (!repoFlag || repoFlag.length === 0) {
    return undefined;
  }
  
  const parsed = repoFlag.flatMap(flag => flag.split(",").map(s => s.trim()).filter(Boolean));
  return Array.from(new Set(parsed));
}
