export interface WorktreeRow {
  repoName: string;
  branch: string;
  path: string;
  commitShort: string;
  isMainCheckout: boolean;
  isLocked: boolean;
  isPrunable: boolean;
  isBare: boolean;
  dirtyFiles: string[];
  ahead: number | null;
  behind: number | null;
  prNumber: number | null;
  prState: string | null;
  prChecks: string | null;
  prUrl: string | null;
  owner: string | null;
  rebaseStatus: string | null;
  depsStrategy: string;
  base?: string;
  baseChanged?: boolean;
  hierarchyDepth?: number;
  hierarchyPrefix?: string;
  isPendingCreate?: boolean;
}

export interface RepoBlock {
  repoName: string;
  rows: WorktreeRow[];
}
