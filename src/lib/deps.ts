import type { GlobalOptions } from "../types.js";
import { resolveAdapter, detectCommonLinkageState } from "./deps/engine.js";
import type { DepsStrategy, LinkageState } from "./deps/types.js";
import { verbose, stepProgress, stepSuccess, stepWarning } from "./log.js";
import { loadConfig } from "./config.js";
import { resolveRepos } from "./resolver.js";
import { expandTemplate } from "./template.js";
import { execa } from "execa";

export interface DepsState {
  strategy:
    | "symlinked"
    | "independent"
    | "none"
    | "broken"
    | "external"
    | "installed"
    | "missing"
    | "linked-packages"
    | "shared-target";
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
    case "shared-target": return "shared-target";
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
  let manager: string | undefined;
  let strategy: DepsStrategy = "auto";

  try {
    const config = loadConfig();
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

interface RepoDepsContext {
  name: string;
  root: string;
  postfix: string;
  mainPath: string;
  manager?: string;
  installScript: string | null;
}

function findRepoDepsContext(wtPath: string): RepoDepsContext {
  try {
    const config = loadConfig();
    const repos = resolveRepos(config, []);
    const repo = repos.find(r => wtPath === r.mainPath || wtPath === r.wtRoot || wtPath.startsWith(r.wtRoot + "/"));
    if (repo) {
      return {
        name: repo.name,
        root: config.root,
        postfix: config.postfix,
        mainPath: repo.mainPath,
        manager: repo.config.deps?.manager !== "auto" ? repo.config.deps.manager : undefined,
        installScript: repo.config.install_script ?? null,
      };
    }
  } catch {}
  return { name: "", root: "", postfix: "", mainPath: wtPath, installScript: null };
}

export async function runInstallScript(
  script: string,
  wtPath: string,
  ctx: RepoDepsContext,
  opts: GlobalOptions
): Promise<boolean> {
  const branch = wtPath.split("/").pop() ?? "";
  const expanded = expandTemplate(script, {
    root: ctx.root,
    repo: ctx.name,
    branch,
    main: ctx.mainPath,
    wt: wtPath,
    postfix: ctx.postfix,
    port: 0,
  });

  stepProgress(`Running install script: ${expanded}...`);
  if (opts.dryRun) {
    verbose("[dry-run] skipped install script", opts.verbose);
    return true;
  }

  try {
    const result = await execa(expanded, { shell: true, cwd: wtPath, reject: false });
    if (result.exitCode === 0) {
      stepSuccess("Install script succeeded", expanded);
      return true;
    }
    stepWarning("Install script failed", result.stderr || result.message || `exit code ${result.exitCode}`);
    return false;
  } catch (err: any) {
    stepWarning("Install script failed", err.message);
    return false;
  }
}

export async function switchToInstall(wtPath: string, opts: GlobalOptions): Promise<boolean> {
  const ctx = findRepoDepsContext(wtPath);

  if (ctx.installScript) {
    return runInstallScript(ctx.installScript, wtPath, ctx, opts);
  }

  const adapter = resolveAdapter(wtPath, ctx.manager) ?? resolveAdapter(ctx.mainPath, ctx.manager) ?? resolveAdapter(wtPath, "npm");
  if (!adapter) return false;

  await adapter.sync({
    wtPath,
    mainPath: ctx.mainPath,
    dryRun: opts.dryRun,
    strategy: "install",
  });
  return true;
}

export async function switchToSymlink(wtPath: string, mainPath: string, opts: GlobalOptions): Promise<void> {
  const ctx = findRepoDepsContext(wtPath);
  const resolvedMain = ctx.name ? ctx.mainPath : mainPath;

  const adapter = resolveAdapter(wtPath, ctx.manager) ?? resolveAdapter(resolvedMain, ctx.manager) ?? resolveAdapter(wtPath, "npm");
  if (!adapter) return;

  await adapter.sync({
    wtPath,
    mainPath: resolvedMain,
    dryRun: opts.dryRun,
    strategy: "symlink",
  });
}
