import { z } from "zod/v4";
import os from "os";
import path from "path";

const DepsManagerEnum = z.enum(["auto", "npm", "bun", "pnpm", "yarn", "go", "python", "cargo"]);
const DepsStrategyEnum = z.enum(["auto", "link", "symlink", "install", "off"]);

export const DepsConfigSchema = z.object({
  manager: DepsManagerEnum.default("auto"),
  strategy: DepsStrategyEnum.default("auto"),
});

export type DepsManager = z.infer<typeof DepsManagerEnum>;
export type DepsStrategy = z.infer<typeof DepsStrategyEnum>;
export type DepsConfig = z.infer<typeof DepsConfigSchema>;

export const AgentConfigSchema = z.object({
  command: z.string().trim().min(1, { message: "must not be empty" }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const PortsConfigSchema = z.object({
  min: z.number().int().min(1024).max(65535).default(4100),
  max: z.number().int().min(1024).max(65535).default(4999),
}).refine((v) => v.min <= v.max, { message: "ports.min must be less than or equal to ports.max" });

export type PortsConfig = z.infer<typeof PortsConfigSchema>;

export const RepoConfigSchema = z.object({
  main_branch: z.string().trim().superRefine((val, ctx) => {
    if (val !== "auto" && val.length === 0) {
      ctx.addIssue({ code: "custom", message: "must not be empty when not 'auto'" });
    }
  }).default("auto"),
  fetch_main_on_create: z.boolean().default(true),
  sync_files: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
  post_sync: z.array(z.string()).optional(),
  pr: z.boolean().default(true),
  forge: z.enum(["auto", "github"]).default("auto"),
  pr_repo: z.string().trim().min(1, { message: "must not be empty if provided" }).nullable().default(null),
  deps: DepsConfigSchema.default({ manager: "auto", strategy: "auto" }),
});

export const ConfigSchema = z.object({
  version: z.literal(1),
  root: z.string().trim().min(1, { message: "must not be empty" }).superRefine((val, ctx) => {
    let expanded = val;
    if (expanded.startsWith("~/") || expanded === "~") {
      expanded = expanded.replace(/^~/, os.homedir());
    }
    if (!path.isAbsolute(expanded)) {
      ctx.addIssue({ code: "custom", message: "must be an absolute path after tilde expansion" });
    }
  }),
  postfix: z.string().trim().min(1, { message: "must not be empty" }).superRefine((val, ctx) => {
    if (val.includes("/") || val.includes("\\")) {
      ctx.addIssue({ code: "custom", message: "must not contain path separators" });
    }
  }).default("-wt"),
  ide: z.string().trim().min(1, { message: "must not be empty" }).default("cursor"),
  default_main_branch: z.string().trim().min(1, { message: "must not be empty" }).default("main"),
  user: z.string().trim().min(1, { message: "must not be empty if provided" }).nullable().default(null),
  repos: z.record(
    z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid repo key format"),
    RepoConfigSchema
  ),
  agents: z.record(
    z.string().regex(/^[a-z][a-z0-9_-]*$/, "Agent names must be lowercase alphanumeric with dashes/underscores"),
    AgentConfigSchema
  ).optional(),
  ports: PortsConfigSchema.default({ min: 4100, max: 4999 }),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export interface GlobalOptions {
  verbose: boolean;
  dryRun: boolean;
  quiet?: boolean;
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
