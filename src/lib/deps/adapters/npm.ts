import fs from "fs";
import path from "path";
import type { DepsAdapter, AdapterDepsState, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { getWorkspaceDelta } from "../diff.js";
import { detectCommonLinkageState, executeSync } from "../engine.js";

export const npmAdapter: DepsAdapter = {
  id: "npm",
  displayName: "npm",
  
  detect: (dir: string) => fs.existsSync(path.join(dir, "package-lock.json")),
  
  lockfileNames: ["package-lock.json"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    const delta = getWorkspaceDelta(wtPath, mainPath, ["package-lock.json"]);
    return delta.rootMatches && delta.changedWorkspaces.length === 0;
  },
  
  currentState: (wtPath: string, mainPath: string): AdapterDepsState => {
    const common = detectCommonLinkageState(wtPath, mainPath);
    const lockMatch = npmAdapter.definitionsMatch(wtPath, mainPath);
    return {
      state: common.state,
      lockfileMatch: lockMatch,
      target: common.target,
    };
  },
  
  sync: (ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome> => {
    return executeSync(
      npmAdapter,
      ctx,
      "npm",
      ["install"],
      (workspaces) => {
        const args = ["install"];
        for (const ws of workspaces) {
          // getWorkspaceDirs returns relative paths like "packages/foo"
          // In npm, -w takes the workspace name or directory
          args.push("-w", ws);
        }
        return args;
      }
    );
  }
};
