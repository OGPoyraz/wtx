import fs from "fs";
import path from "path";
import os from "os";
import { ConfigSchema } from "../types.js";
import type { Config } from "../types.js";
import { stepWarning } from "./log.js";

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
    throw new Error(`Config file not found at ${configPath}. Run 'wtx config init' to create one.`);
  }

  const fileContent = fs.readFileSync(configPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err) {
    throw new Error(`Failed to parse config file at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config format: ${result.error.message}`);
  }

  const config = result.data;
  config.root = expandTilde(config.root);

  if (!fs.existsSync(config.root)) {
    stepWarning(`Root directory does not exist: ${config.root}`);
  } else {
    for (const [repoName] of Object.entries(config.repos)) {
      const repoGitPath = path.join(config.root, repoName, ".git");
      if (!fs.existsSync(repoGitPath)) {
        stepWarning(`Repo ${repoName} is missing .git directory at ${repoGitPath}`);
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
