import type { GlobalOptions } from "../types.js";
import { resolveAdapter, detectCommonLinkageState } from "./deps/engine.js";
import type { DepsStrategy, LinkageState } from "./deps/types.js";
import { verbose } from "./log.js";
import { loadConfig } from "./config.js";
import { resolveRepos } from "./resolver.js";

export interface DepsState {
  strategy: "symlinked" | "independent" | "none" | "broken" | "external" | "installed" | "missing" | "linked-packages";
  lockfileMatch: boolean;
  packageManager: "yarn" | "npm" | "pnpm" | "bun" | null;
  symlinkTarget?: string;
  repairHint?: string;
}

function mapLinkageState(state: LinkageState): DepsState["strategy"] {
  switch (state) {
    case "linked-whole": return "symlinked";
    case "independent": return "independent";
    case "broken": return "broken";
    case "external": return "external";
    case "installed": return "installed";
    case "missing": return "missing";
    case "linked-packages": return "linked-packages";
    case "shared-target": return "installed";
    default: return "none";
  }
}

export function detectDepsState(wtPath: string, mainPath: string): DepsState {
  const adapter = resolveAdapter(wtPath) ?? resolveAdapter(mainPath);
  
  if (!adapter) {
    const common = detectCommonLinkageState(wtPath, mainPath);
    return {
      strategy: mapLinkageState(common.state),
      lockfileMatch: true,
      packageManager: null,
      symlinkTarget: common.target,
    };
  }

  const adapterState = adapter.currentState(wtPath, mainPath);
  
  return {
    strategy: mapLinkageState(adapterState.state),
    lockfileMatch: adapterState.lockfileMatch,
    packageManager: adapter.id as DepsState["packageManager"],
    symlinkTarget: adapterState.target,
    repairHint: adapterState.repairHint,
  };
}

export async function autoInstallDeps(wtPath: string, mainPath: string, opts: GlobalOptions): Promise<void> {
  const config = loadConfig();
  let manager: string | undefined;
  let strategy: DepsStrategy = "auto";
  
  try {
    const repos = resolveRepos(config, []);
    const repo = repos.find(r => wtPath.startsWith(r.wtRoot));
    if (repo && repo.config.deps) {
      manager = repo.config.deps.manager !== "auto" ? repo.config.deps.manager : undefined;
      strategy = repo.config.deps.strategy;
    }
  } catch {}

  const adapter = resolveAdapter(wtPath, manager) ?? resolveAdapter(mainPath, manager);
  
  if (!adapter) {
    verbose("No lockfile detected, skipping deps", opts.verbose);
    return;
  }

  await adapter.sync({
    wtPath,
    mainPath,
    dryRun: opts.dryRun,
    strategy,
  });
}

export async function switchToInstall(wtPath: string, opts: GlobalOptions): Promise<void> {
  const config = loadConfig();
  let mainPath = wtPath; 
  let manager: string | undefined;
  try {
    const repos = resolveRepos(config, []);
    const repo = repos.find(r => wtPath.startsWith(r.wtRoot));
    if (repo) {
      mainPath = repo.mainPath;
      if (repo.config.deps && repo.config.deps.manager !== "auto") {
        manager = repo.config.deps.manager;
      }
    }
  } catch {}

  const adapter = resolveAdapter(wtPath, manager) ?? resolveAdapter(mainPath, manager) ?? resolveAdapter(wtPath, "npm");
  if (!adapter) return;

  await adapter.sync({
    wtPath,
    mainPath,
    dryRun: opts.dryRun,
    strategy: "install",
  });
}

export async function switchToSymlink(wtPath: string, mainPath: string, opts: GlobalOptions): Promise<void> {
  const config = loadConfig();
  let manager: string | undefined;
  try {
    const repos = resolveRepos(config, []);
    const repo = repos.find(r => wtPath.startsWith(r.wtRoot));
    if (repo && repo.config.deps && repo.config.deps.manager !== "auto") {
      manager = repo.config.deps.manager;
    }
  } catch {}

  const adapter = resolveAdapter(wtPath, manager) ?? resolveAdapter(mainPath, manager) ?? resolveAdapter(wtPath, "npm");
  if (!adapter) return;

  await adapter.sync({
    wtPath,
    mainPath,
    dryRun: opts.dryRun,
    strategy: "symlink",
  });
}
