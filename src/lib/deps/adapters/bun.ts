import fs from "fs";
import path from "path";
import type { DepsAdapter, AdapterDepsState, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { getWorkspaceDelta } from "../diff.js";
import { detectCommonLinkageState, executeSync } from "../engine.js";

export const bunAdapter: DepsAdapter = {
  id: "bun",
  displayName: "bun",
  
  detect: (dir: string) => fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock")),
  
  lockfileNames: ["bun.lockb", "bun.lock"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    const delta = getWorkspaceDelta(wtPath, mainPath, ["bun.lockb", "bun.lock"]);
    return delta.rootMatches && delta.changedWorkspaces.length === 0;
  },
  
  currentState: (wtPath: string, mainPath: string): AdapterDepsState => {
    const common = detectCommonLinkageState(wtPath, mainPath);
    const lockMatch = bunAdapter.definitionsMatch(wtPath, mainPath);
    return {
      state: common.state,
      lockfileMatch: lockMatch,
      target: common.target,
    };
  },
  
  sync: (ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome> => {
    return executeSync(
      bunAdapter,
      ctx,
      "bun",
      ["install"],
      (workspaces) => {
        const args = ["install"];
        for (const ws of workspaces) {
          args.push("--filter", `./${ws}`);
        }
        return args;
      }
    );
  }
};
