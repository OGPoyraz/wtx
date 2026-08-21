import { z } from "zod/v4";

export const RepoConfigSchema = z.object({
  main_branch: z.string().default("auto"),
  sync_files: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
  post_sync: z.array(z.string()).optional(),
});

export const ConfigSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  postfix: z.string().default("-wt"),
  ide: z.string().default("cursor"),
  default_main_branch: z.string().default("main"),
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

export const VERSION = "0.1.0";

export const CONFIG_DIR = ".config/wtx";
export const CONFIG_FILE = "config.json";
