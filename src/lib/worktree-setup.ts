import fs from "fs";
import path from "path";
import { execa } from "execa";
import type { Config, GlobalOptions, RepoContext } from "../types.js";
import { stepProgress, stepSuccess, stepWarning } from "./log.js";
import { expandTemplate, type TemplateVars } from "./template.js";

export async function runPostCreateSetup(params: {
  config: Config;
  repo: RepoContext;
  wtPath: string;
  branch: string;
  globalOpts: GlobalOptions;
}): Promise<void> {
  const { config, repo, wtPath, branch, globalOpts } = params;

  if (repo.config.sync_files && repo.config.sync_files.length > 0) {
    for (const file of repo.config.sync_files) {
      const src = path.join(repo.mainPath, file);
      const dest = path.join(wtPath, file);

      if (fs.existsSync(src)) {
        if (!globalOpts.dryRun) {
          fs.copyFileSync(src, dest);
        }
        stepSuccess(`Synced ${file}`);
      } else {
        stepWarning(`Could not sync ${file}`, "file not found in main checkout");
      }
    }
  }

  if (repo.config.post_create && repo.config.post_create.length > 0) {
    const tplVars: TemplateVars = {
      root: config.root,
      repo: repo.name,
      branch,
      main: repo.mainPath,
      wt: wtPath,
      postfix: config.postfix,
    };

    for (const cmd of repo.config.post_create) {
      const expandedCmd = expandTemplate(cmd, tplVars);
      stepProgress(`Running post-create: ${expandedCmd.split(" ")[0]}...`);

      if (!globalOpts.dryRun) {
        try {
          await execa(expandedCmd, { shell: true, cwd: wtPath });
          stepSuccess(`Command succeeded`, expandedCmd);
        } catch (err: any) {
          stepWarning(`Command failed`, err.message);
        }
      }
    }
    stepSuccess("Post-create complete");
  }
}
