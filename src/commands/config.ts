import readline from "readline";
import { Command } from "commander";
import {
  getConfigPath,
  configExists,
  loadConfig,
  saveConfig
} from "../lib/config.js";
import { info, error, summary } from "../lib/log.js";
import type { Config, RepoConfig } from "../types.js";

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

export function registerConfigCommand(program: Command) {
  const configCmd = program
    .command("config")
    .description("Manage wtx configuration");

  configCmd
    .command("init")
    .description("Initialize wtx configuration")
    .action(async () => {
      if (configExists()) {
        error(`Config already exists at ${getConfigPath()}`);
        process.exit(1);
      }

      const root = (await askQuestion("Root path [~/Repos]: ")) || "~/Repos";
      const ide = (await askQuestion("IDE [cursor]: ")) || "cursor";
      const postfix = (await askQuestion("Postfix [-wt]: ")) || "-wt";

      const defaultConfig: Config = {
        version: 1,
        root,
        postfix,
        ide,
        default_main_branch: "main",
        repos: {},
      };

      saveConfig(defaultConfig);
      summary(`Config created at ${getConfigPath()}`);
    });

  configCmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      if (!configExists()) {
        error("Config does not exist. Run 'wtx config init' first.");
        process.exit(1);
      }
      const config = loadConfig();
      info(JSON.stringify(config, null, 2));
    });

  configCmd
    .command("set <key> <value>")
    .description("Set a top-level configuration key")
    .action((key, value) => {
      const config = loadConfig();
      const validKeys = ["root", "postfix", "ide", "default_main_branch"] as const;
      type ValidKey = (typeof validKeys)[number];
      if (!validKeys.includes(key as ValidKey)) {
        error(`Invalid key: ${key}. Allowed keys: root, postfix, ide, default_main_branch`);
        process.exit(1);
      }

      const updated = { ...config, [key as ValidKey]: value };
      saveConfig(updated);
      summary(`Set ${key} to ${value}`);
    });

  configCmd
    .command("add-repo <name>")
    .description("Add or update a repo in configuration")
    .option("--sync-files <files>", "Comma-separated list of files to sync")
    .option("--post-create <cmds>", "Comma-separated list of post-create commands")
    .option("--post-sync <cmds>", "Comma-separated list of post-sync commands")
    .action((name, options) => {
      const config = loadConfig();
      
      const repoConfig: RepoConfig = config.repos[name] || { main_branch: "auto" };

      if (options.syncFiles) {
        repoConfig.sync_files = options.syncFiles.split(",").map((s: string) => s.trim()).filter(Boolean);
      }
      if (options.postCreate) {
        repoConfig.post_create = options.postCreate.split(",").map((s: string) => s.trim()).filter(Boolean);
      }
      if (options.postSync) {
        repoConfig.post_sync = options.postSync.split(",").map((s: string) => s.trim()).filter(Boolean);
      }

      config.repos[name] = repoConfig;
      saveConfig(config);
      summary(`Added/updated repo: ${name}`);
    });

  configCmd
    .command("remove-repo <name>")
    .description("Remove a repo from configuration")
    .action((name) => {
      const config = loadConfig();
      if (!config.repos[name]) {
        error(`Repo not found in config: ${name}`);
        process.exit(1);
      }
      delete config.repos[name];
      saveConfig(config);
      summary(`Removed repo: ${name}`);
    });
}
