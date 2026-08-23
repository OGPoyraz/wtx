export type LinkageState =
  | "missing"
  | "installed"
  | "linked-whole"
  | "linked-packages"
  | "broken"
  | "external"
  | "shared-target"
  | "independent";

export interface AdapterDepsState {
  state: LinkageState;
  lockfileMatch: boolean;
  target?: string;
  repairHint?: string;
}

export interface SyncContext {
  wtPath: string;
  mainPath: string;
  dryRun: boolean;
}

export interface SyncOutcome {
  action: "linked" | "installed" | "skipped" | "failed";
  detail?: string;
}

export type DepsStrategy = "auto" | "link" | "symlink" | "install" | "off";

/**
 * Contract every dependency adapter implements. One adapter per ecosystem.
 * detect() must be cheap and side-effect free; sync() honors dryRun strictly.
 */
export interface DepsAdapter {
  id: string;
  displayName: string;
  /** Cheap ecosystem detection for a directory (lockfile/config presence). */
  detect(dir: string): boolean;
  /** Lockfile/manifest names that define this ecosystem's dependency state. */
  lockfileNames: string[];
  /** Whether wt and main dependency definitions are identical. */
  definitionsMatch(wtPath: string, mainPath: string): boolean;
  /** Current linkage state of the worktree's dependencies. */
  currentState(wtPath: string, mainPath: string): AdapterDepsState;
  /** Bring worktree deps in line with the requested strategy. */
  sync(ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome>;
}
