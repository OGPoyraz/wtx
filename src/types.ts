import { z } from "zod/v4";

export const RepoConfigSchema = z.object({
  main_branch: z.string().default("auto"),
  fetch_main_on_create: z.boolean().default(true),
  sync_files: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
  post_sync: z.array(z.string()).optional(),
  pr: z.boolean().default(true),
  forge: z.enum(["auto", "github"]).default("auto"),
  pr_repo: z.string().nullable().default(null),
});

export const ConfigSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  postfix: z.string().default("-wt"),
  ide: z.string().default("cursor"),
  default_main_branch: z.string().default("main"),
  user: z.string().nullable().default(null),
  repos: z.record(z.string(), RepoConfigSchema),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export interface GlobalOptions {
  verbose: boolean;
  dryRun: boolean;
}

export interface RepoContext {
  name: string;
  mainPath: string;
  wtRoot: string;
  config: RepoConfig;
}

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(dir, "..", "package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

export const VERSION = getVersion();

export const CONFIG_DIR = ".config/wtx";
export const CONFIG_FILE = "config.json";
