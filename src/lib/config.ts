import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { ConfigSchema } from "../types.js";
import type { Config } from "../types.js";
import { stepProgress, stepWarning } from "./log.js";
import { isWithin, safeResolve } from "./path-safety.js";

const loggedV2Migrations = new Set<string>();

function migrateV1Config(raw: unknown): { config: unknown; migrated: boolean } {
  if (typeof raw !== "object" || raw === null) {
    return { config: raw, migrated: false };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 && obj.version !== undefined) {
    return { config: raw, migrated: false };
  }

  return { config: { ...obj, version: 2 }, migrated: true };
}

export function expandTilde(value: string): string {
  if (value.startsWith("~/") || value === "~") {
    return value.replace(/^~/, os.homedir());
  }
  return value;
}

export function getConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "wtx");
  }
  return path.join(os.homedir(), ".config", "wtx");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function configExists(): boolean {
  return fs.existsSync(getConfigPath());
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    if (
      process.stdout.isTTY &&
      process.env.WTX_NO_WIZARD !== "1" &&
      !process.argv.includes("_resolve-path")
    ) {
      const argv1 = process.argv[1] ?? "";
      const runningCompiledBinary =
        argv1 !== "" && path.resolve(argv1) === path.resolve(process.execPath);
      const args = runningCompiledBinary
        ? ["config", "init"]
        : [argv1, "config", "init"];

      const res = spawnSync(process.execPath, args, { stdio: "inherit" });
      if (res.status !== 0) {
        process.exit(res.status ?? 1);
      }
      if (!fs.existsSync(configPath)) {
        stepWarning("Config still missing after setup — continuing without it");
        throw new Error(`Config file not found at ${configPath}. Run 'wtx config init'.`);
      }
    } else {
      throw new Error(`Config file not found at ${configPath}.
Run 'wtx config init' to create one interactively, or create it manually with:
{
  "version": 2,
  "root": "~/Repos",
  "postfix": "-wt",
  "ide": "cursor",
  "default_main_branch": "main",
  "repos": {}
}`);
    }
  }

  const fileContent = fs.readFileSync(configPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err) {
    throw new Error(`Failed to parse config file at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const migrated = migrateV1Config(parsed);
  if (migrated.migrated && !loggedV2Migrations.has(configPath)) {
    loggedV2Migrations.add(configPath);
    stepProgress("migrated config to v2");
  }

  const result = ConfigSchema.safeParse(migrated.config);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const pathStr = issue.path.join(".");
      let msg = issue.message;
      const nested = (issue as { issues?: Array<{ message: string }> }).issues;
      if (issue.code === "invalid_key" && nested?.length) {
        msg = nested[0]?.message ?? msg;
      }
      return pathStr ? `${pathStr} invalid because ${msg}` : `Invalid config: ${msg}`;
    });
    throw new Error(`Invalid config format:\n${messages.join("\n")}`);
  }

  const config = result.data;
  config.root = expandTilde(config.root);

  if (!fs.existsSync(config.root)) {
    stepWarning(`Root directory does not exist: ${config.root}`);
  } else {
    for (const [repoName] of Object.entries(config.repos)) {
      const repoMainPath = path.join(config.root, repoName);
      const repoGitPath = path.join(repoMainPath, ".git");
      const wtRoot = `${repoMainPath}${config.postfix}`;

      if (!fs.existsSync(repoMainPath)) {
        stepWarning(`Repo ${repoName} main checkout directory does not exist at ${repoMainPath}`);
      } else if (!fs.existsSync(repoGitPath)) {
        stepWarning(`Repo ${repoName} is missing .git directory at ${repoGitPath}`);
      }

      if (fs.existsSync(repoMainPath)) {
        const resolvedMain = safeResolve(repoMainPath);
        const resolvedWtRoot = safeResolve(wtRoot);
        
        if (isWithin(resolvedMain, resolvedWtRoot) || isWithin(resolvedWtRoot, resolvedMain)) {
          stepWarning(`Config for repo ${repoName} creates a nesting issue: wtRoot and main checkout resolve inside each other. Fix your config postfix or root.`);
        }
      }
    }
  }

  return config;
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const configDir = getConfigDir();

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configToSave = { ...config };
  const home = os.homedir();
  if (configToSave.root === home) {
    configToSave.root = "~";
  } else if (configToSave.root.startsWith(home + path.sep)) {
    configToSave.root = "~" + configToSave.root.slice(home.length);
  }

  const tmpPath = path.join(configDir, `config.json.tmp.${process.pid}`);
  const data = JSON.stringify(configToSave, null, 2);

  try {
    fs.writeFileSync(tmpPath, data, "utf-8");
    fs.renameSync(tmpPath, configPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw err;
  }
}
