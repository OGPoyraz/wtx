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
  if (pattern.endsWith("/*")) {
    const parentDir = pattern.slice(0, -2);
    const fullParent = path.join(rootDir, parentDir);
    if (fs.existsSync(fullParent)) {
      try {
        const entries = fs.readdirSync(fullParent, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            out.add(path.posix.join(parentDir, entry.name));
          }
        }
      } catch {}
    }
  } else {
    const fullPath = path.join(rootDir, pattern);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        out.add(pattern);
      }
    }
  }
}
