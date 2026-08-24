import fs from "fs";
import path from "path";
import type { RepoContext } from "../../types.js";
import {
  createGithubAdapter,
  createGithubDescriptor,
  parseGithubRemote,
  type GithubSlug,
} from "./github.js";
import type { ForgeAdapter, ForgeDescriptor, ForgePrLinkRef, ForgeSlug } from "./types.js";

export { parseGithubRemote };

const FORGES: ForgeDescriptor[] = [createGithubDescriptor()];

export function parsePrLink(link: string): ForgePrLinkRef | null {
  for (const forge of FORGES) {
    const ref = forge.parsePrLink(link);
    if (ref) return ref;
  }
  return null;
}

export function descriptorFor(id: string): ForgeDescriptor | null {
  return FORGES.find((f) => f.id === id) ?? null;
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

export function detectRepoForge(mainPath: string): { forgeId: string; slug: ForgeSlug } | null {
  const url = readOriginUrl(mainPath);
  if (!url) return null;
  for (const forge of FORGES) {
    const slug = forge.parseRemote(url);
    if (slug) {
      return { forgeId: forge.id, slug };
    }
  }
  return null;
}

export function resolveForge(repoCtx: RepoContext): ForgeAdapter | null {
  if (repoCtx.config.check_prs === false) return null;

  const remoteUrl = readOriginUrl(repoCtx.mainPath);
  if (!remoteUrl) return null;

  const parsed = parseGithubRemote(remoteUrl);
  if (!parsed) return null;

  if (repoCtx.config.forge_provider === "auto" && parsed.host !== "github.com") {
    return null;
  }

  let slug: GithubSlug = parsed;
  if (repoCtx.config.pr_lookup_repo) {
    slug = parseSlugOverride(repoCtx.config.pr_lookup_repo) ?? parsed;
  }

  return createGithubAdapter(slug);
}
