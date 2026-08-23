import fs from "fs";
import path from "path";
import { getWorkspaceDirs } from "./workspaces.js";

export function filesMatch(wtPath: string, mainPath: string, fileNames: string[]): boolean {
  for (const name of fileNames) {
    const wtFile = path.join(wtPath, name);
    const mainFile = path.join(mainPath, name);
    const wtExists = fs.existsSync(wtFile);
    const mainExists = fs.existsSync(mainFile);

    if (wtExists !== mainExists) return false;
    if (!wtExists) continue;

    try {
      const wtContent = fs.readFileSync(wtFile);
      const mainContent = fs.readFileSync(mainFile);
      if (!wtContent.equals(mainContent)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export interface WorkspaceDelta {
  rootMatches: boolean;
  changedWorkspaces: string[];
}

export function getWorkspaceDelta(wtPath: string, mainPath: string, lockfileNames: string[]): WorkspaceDelta {
  const rootFiles = ["package.json", ...lockfileNames];
  const rootMatches = filesMatch(wtPath, mainPath, rootFiles);

  const mainWorkspaces = getWorkspaceDirs(mainPath);
  const wtWorkspaces = getWorkspaceDirs(wtPath);
  
  const allWorkspaces = new Set([...mainWorkspaces, ...wtWorkspaces]);
  const changedWorkspaces: string[] = [];

  for (const ws of allWorkspaces) {
    const wsFiles = ["package.json"];
    if (!filesMatch(path.join(wtPath, ws), path.join(mainPath, ws), wsFiles)) {
      changedWorkspaces.push(ws);
    }
  }

  return { rootMatches, changedWorkspaces };
}
