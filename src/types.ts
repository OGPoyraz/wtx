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

export const ThemeTokensSchema = z.object({
  bg: z.string().optional(),
  fg: z.string().optional(),
  muted: z.string().optional(),
  accent: z.string().optional(),
  success: z.string().optional(),
  warning: z.string().optional(),
  error: z.string().optional(),
  border: z.string().optional(),
  selection: z.string().optional(),
});

export const TuiConfigSchema = z.object({
  leftPaneWidthWeight: z.number().int().min(1).max(10).default(3),
  rightPaneWidthWeight: z.number().int().min(1).max(10).default(7),
  theme: z.string().default("tokyonight"),
  custom_theme: ThemeTokensSchema.partial().nullable().default(null),
});

export type TuiConfig = z.infer<typeof TuiConfigSchema>;

const LEGACY_REPO_KEYS: Record<string, string> = {
  pr: "check_prs",
  forge: "forge_provider",
  pr_repo: "pr_lookup_repo",
};

function migrateLegacyRepoKeys(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  for (const [legacy, current] of Object.entries(LEGACY_REPO_KEYS)) {
    if (legacy in obj && !(current in obj)) {
      obj[current] = obj[legacy];
    }
    delete obj[legacy];
  }
  return obj;
}

function migrateConfigVersion(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 && obj.version !== undefined) return raw;
  return { ...obj, version: 2 };
}

export const RepoConfigSchema = z.preprocess(
  migrateLegacyRepoKeys,
  z.object({
    main_branch: z.string().trim().superRefine((val, ctx) => {
      if (val !== "auto" && val.length === 0) {
        ctx.addIssue({ code: "custom", message: "must not be empty when not 'auto'" });
      }
    }).default("auto"),
    fetch_main_on_create: z.boolean().default(true),
    sync_files: z.array(z.string()).optional(),
    post_create: z.array(z.string()).optional(),
    post_sync: z.array(z.string()).optional(),
    install_script: z.string().trim().min(1, { message: "must not be empty if provided" }).nullable().default(null),
    check_prs: z.boolean().default(true),
    forge_provider: z.enum(["auto", "github"]).default("auto"),
    pr_lookup_repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, { message: "must use 'owner/repo' format" }).nullable().default(null),
    deps: DepsConfigSchema.default({ manager: "auto", strategy: "auto" }),
  })
);

export const ConfigSchema = z.preprocess(migrateConfigVersion, z.object({
  version: z.literal(2),
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
  favorites: z.array(z.string()).default([]),
  workspace_root: z.string().nullable().default(null),
  agents: z.record(
    z.string().regex(/^[a-z][a-z0-9_-]*$/, "Agent names must be lowercase alphanumeric with dashes/underscores"),
    AgentConfigSchema
  ).optional(),
  ports: PortsConfigSchema.default({ min: 4100, max: 4999 }),
  tui: TuiConfigSchema.default({
    leftPaneWidthWeight: 3,
    rightPaneWidthWeight: 7,
    theme: "tokyonight",
    custom_theme: null,
  }),
}));

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
