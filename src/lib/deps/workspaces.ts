import fs from "fs";
import path from "path";

export function getWorkspaceDirs(rootDir: string): string[] {
  const dirs = new Set<string>();

  const pkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.workspaces) {
        let ws: string[] = [];
        if (Array.isArray(pkg.workspaces)) {
          ws = pkg.workspaces;
        } else if (Array.isArray(pkg.workspaces.packages)) {
          ws = pkg.workspaces.packages;
        }
        for (const pattern of ws) {
          resolvePattern(rootDir, pattern, dirs);
        }
      }
    } catch {}
  }

  const pnpmPath = path.join(rootDir, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmPath)) {
    try {
      const content = fs.readFileSync(pnpmPath, "utf-8");
      const lines = content.split(/\r?\n/);
      let inPackages = false;
      for (let line of lines) {
        line = (line.split("#")[0] ?? "").trim();
        if (!line) continue;
        
        if (line === "packages:") {
          inPackages = true;
          continue;
        }
        
        if (inPackages && line.startsWith("- ")) {
          let pattern = line.slice(2).trim();
          if (pattern.startsWith("'") && pattern.endsWith("'")) {
            pattern = pattern.slice(1, -1);
          } else if (pattern.startsWith('"') && pattern.endsWith('"')) {
            pattern = pattern.slice(1, -1);
          }
          resolvePattern(rootDir, pattern, dirs);
        } else if (inPackages && !line.startsWith("- ")) {
          inPackages = false;
        }
      }
    } catch {}
  }

  return Array.from(dirs);
}

function resolvePattern(rootDir: string, pattern: string, out: Set<string>) {
  const normalized = pattern.replace(/\/+$/, "");
  const hasGlob = normalized.includes("*");

  if (!hasGlob) {
    const fullDir = path.join(rootDir, normalized);
    if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
      out.add(normalized);
    }
    return;
  }

  const regex = globToRegex(normalized);
  collectMatchingDirs(rootDir, "", regex, out, 0);
}

function globToRegex(pattern: string): RegExp {
  let src = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${src}$`);
}

function collectMatchingDirs(
  base: string,
  rel: string,
  regex: RegExp,
  out: Set<string>,
  depth: number
) {
  if (depth > 8) return;

  if (rel && regex.test(rel) && fs.existsSync(path.join(base, rel, "package.json"))) {
    out.add(rel);
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rel ? path.join(base, rel) : base, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const nextRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (!regex.test(nextRel) && !couldMatchDeeper(regex.source, nextRel)) continue;
    collectMatchingDirs(base, nextRel, regex, out, depth + 1);
  }
}

function couldMatchDeeper(regexSource: string, rel: string): boolean {
  return new RegExp(`^${regexSource.slice(1, -1)}(?:/|$)`).test(`${rel}/x`) || regexSource.includes("(?:.*/)?");
}
