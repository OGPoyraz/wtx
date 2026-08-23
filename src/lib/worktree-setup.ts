import fs from "fs";
import path from "path";
import { execa } from "execa";
import type { Config, GlobalOptions, RepoContext } from "../types.js";
import { stepProgress, stepSuccess, stepWarning } from "./log.js";
import { expandTemplate, type TemplateVars } from "./template.js";
import { getWorktreePort } from "./ports.js";

export interface HookResult { command: string; ok: boolean; exitCode: number | null }

export interface SetupResult { copiedFiles: string[]; hooks: HookResult[] }

export async function runPostCreateSetup(params: {
  config: Config;
  repo: RepoContext;
  wtPath: string;
  branch: string;
  globalOpts: GlobalOptions;
}): Promise<SetupResult> {
  const { config, repo, wtPath, branch, globalOpts } = params;
  let copiedFiles: string[] = [];
  let hooks: HookResult[] = [];

  if (repo.config.sync_files && repo.config.sync_files.length > 0) {
    for (const file of repo.config.sync_files) {
      const src = path.join(repo.mainPath, file);
      const dest = path.join(wtPath, file);

      if (fs.existsSync(src)) {
        if (!globalOpts.dryRun) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          copiedFiles.push(file);
        }
        stepSuccess(`Synced ${file}`);
      } else {
        stepWarning(`Could not sync ${file}`, "file not found in main checkout");
      }
    }
  }

  if (repo.config.post_create && repo.config.post_create.length > 0) {
    const port = await getWorktreePort(repo.name, branch, config, wtPath);
    const env = { ...process.env, WTX_PORT: String(port) };

    const tplVars: TemplateVars = {
      root: config.root,
      repo: repo.name,
      branch,
      main: repo.mainPath,
      wt: wtPath,
      postfix: config.postfix,
      port,
    };

    for (const cmd of repo.config.post_create) {
      const expandedCmd = expandTemplate(cmd, tplVars);
      stepProgress(`Running post-create: ${expandedCmd.split(" ")[0]}...`);

      if (!globalOpts.dryRun) {
        try {
          const result = await execa(expandedCmd, { shell: true, cwd: wtPath, env, reject: false });
          if (result.exitCode === 0) {
            stepSuccess(`Command succeeded`, expandedCmd);
            hooks.push({ command: expandedCmd, ok: true, exitCode: 0 });
          } else {
            stepWarning(`Command failed`, result.stderr || result.message || `exit code ${result.exitCode}`);
            hooks.push({ command: expandedCmd, ok: false, exitCode: result.exitCode ?? null });
          }
        } catch (err: any) {
          stepWarning(`Command failed`, err.message);
          hooks.push({ command: expandedCmd, ok: false, exitCode: err.exitCode ?? null });
        }
      }
    }
    stepSuccess("Post-create complete");
  }

  return { copiedFiles, hooks };
}
