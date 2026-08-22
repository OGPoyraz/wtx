import fs from "fs";
import path from "path";
import type { RepoContext } from "../../types.js";
import { createGithubAdapter, type GithubSlug } from "./github.js";
import type { ForgeAdapter } from "./types.js";

interface ParsedRemote {
  host: string;
  owner: string;
  name: string;
}

const REMOTE_URL_PATTERNS = [
  /^https?:\/\/([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
  /^git@([^:]+):([^/]+)\/([^/.]+?)(?:\.git)?$/,
  /^ssh:\/\/git@([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
];

export function parseGithubRemote(url: string): ParsedRemote | null {
  for (const pattern of REMOTE_URL_PATTERNS) {
    const match = url.trim().match(pattern);
    if (match) {
      return { host: match[1]!, owner: match[2]!, name: match[3]! };
    }
  }
  return null;
}

function readOriginUrl(mainPath: string): string | null {
  const gitConfigPath = path.join(mainPath, ".git", "config");
  if (!fs.existsSync(gitConfigPath)) return null;

  const content = fs.readFileSync(gitConfigPath, "utf-8");
  const originSection = content.match(/\[remote "origin"\]([^[]*)/);
  if (!originSection) return null;

  const urlMatch = originSection[1]!.match(/url\s*=\s*(\S+)/);
  return urlMatch ? urlMatch[1]! : null;
}

function parseSlugOverride(override: string): GithubSlug | null {
  const parts = override.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

export function resolveForge(repoCtx: RepoContext): ForgeAdapter | null {
  if (repoCtx.config.pr === false) return null;

  const remoteUrl = readOriginUrl(repoCtx.mainPath);
  if (!remoteUrl) return null;

  const parsed = parseGithubRemote(remoteUrl);
  if (!parsed) return null;

  if (repoCtx.config.forge === "auto" && parsed.host !== "github.com") {
    return null;
  }

  let slug: GithubSlug = parsed;
  if (repoCtx.config.pr_repo) {
    slug = parseSlugOverride(repoCtx.config.pr_repo) ?? parsed;
  }

  return createGithubAdapter(slug);
}
