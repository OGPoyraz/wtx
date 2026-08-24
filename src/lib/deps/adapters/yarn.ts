import fs from "fs";
import path from "path";
import type { DepsAdapter, AdapterDepsState, SyncContext, DepsStrategy, SyncOutcome } from "../types.js";
import { getWorkspaceDelta } from "../diff.js";
import { detectCommonLinkageState, executeSync } from "../engine.js";

export const yarnAdapter: DepsAdapter = {
  id: "yarn",
  displayName: "yarn",
  
  detect: (dir: string) => fs.existsSync(path.join(dir, "yarn.lock")),
  
  lockfileNames: ["yarn.lock"],
  
  definitionsMatch: (wtPath: string, mainPath: string) => {
    const delta = getWorkspaceDelta(wtPath, mainPath, ["yarn.lock"]);
    return delta.rootMatches && delta.changedWorkspaces.length === 0;
  },
  
  currentState: (wtPath: string, mainPath: string): AdapterDepsState => {
    const common = detectCommonLinkageState(wtPath, mainPath);
    const lockMatch = yarnAdapter.definitionsMatch(wtPath, mainPath);
    return {
      state: common.state,
      lockfileMatch: lockMatch,
      target: common.target,
    };
  },
  
  sync: (ctx: SyncContext & { strategy: DepsStrategy }): Promise<SyncOutcome> => {
    return executeSync(
      yarnAdapter,
      ctx,
      "yarn",
      ["install"],
      () => null
    );
  }
};
