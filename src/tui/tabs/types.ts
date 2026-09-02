import type { ReactNode } from "react";
import type { WorktreeRow } from "../types.js";

export interface TabDef {
  id: string;
  label: string;
  closable?: boolean;
  render: (ctx: { worktree: WorktreeRow | null; isActive: boolean; focused?: boolean }) => ReactNode;
}

export interface TabRegistry {
  tabs: TabDef[];
  activeId: string;
}
