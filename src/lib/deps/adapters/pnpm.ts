import fs from "fs";
import path from "path";
import type { DepsAdapter, AdapterDepsState, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { getWorkspaceDelta } from "../diff.js";
import { detectCommonLinkageState, executeSync } from "../engine.js";

export const pnpmAdapter: DepsAdapter = {
  id: "pnpm",
  displayName: "pnpm",
  
  detect: (dir: string) => fs.existsSync(path.join(dir, "pnpm-lock.yaml")),
  
  lockfileNames: ["pnpm-lock.yaml"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    const delta = getWorkspaceDelta(wtPath, mainPath, ["pnpm-lock.yaml"]);
    return delta.rootMatches && delta.changedWorkspaces.length === 0;
  },
  
  currentState: (wtPath: string, mainPath: string): AdapterDepsState => {
    const common = detectCommonLinkageState(wtPath, mainPath);
    const lockMatch = pnpmAdapter.definitionsMatch(wtPath, mainPath);
    return {
      state: common.state,
      lockfileMatch: lockMatch,
      target: common.target,
    };
  },
  
  sync: (ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome> => {
    return executeSync(
      pnpmAdapter,
      ctx,
      "pnpm",
      ["install"],
      (workspaces) => {
        const args = ["install"];
        for (const ws of workspaces) {
          // pnpm --filter <path>
          args.push("--filter", `./${ws}`);
        }
        return args;
      }
    );
  }
};
