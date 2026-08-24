import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createTempGitRepo } from "./setup.js";
import { resolveCommitSha } from "../src/lib/git.js";
import {
  getStackAncestors,
  getStackChildren,
  readStackMetadata,
  recordStackEntry,
  renameStackEntry,
  removeStackEntry,
  type StackMetadata,
} from "../src/lib/stack.js";

const opts = { verbose: false, dryRun: false };

describe("stack metadata", () => {
  it("records and reads a branch base in the repository common git directory", async () => {
    const repo = createTempGitRepo("stack");
    const baseSha = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();

    await recordStackEntry(repo, "feature/ui", {
      baseRef: "feature/api",
      baseSha,
      explicit: true,
      createdAt: "2026-08-25T00:00:00.000Z",
    }, opts);

    expect(await readStackMetadata(repo, opts)).toEqual({
      version: 1,
      branches: {
        "feature/ui": {
          baseRef: "feature/api",
          baseSha,
          explicit: true,
          createdAt: "2026-08-25T00:00:00.000Z",
        },
      },
    });
    expect(fs.existsSync(path.join(repo, ".git", "wtx", "stack.json"))).toBe(true);
  });

  it("finds ancestors and direct children without treating unrelated branches as stacked", () => {
    const metadata: StackMetadata = {
      version: 1,
      branches: {
        "feature/api": { baseRef: "main", baseSha: "a", explicit: true, createdAt: "" },
        "feature/ui": { baseRef: "feature/api", baseSha: "b", explicit: true, createdAt: "" },
        "feature/docs": { baseRef: "feature/api", baseSha: "b", explicit: true, createdAt: "" },
        independent: { baseRef: "main", baseSha: "a", explicit: false, createdAt: "" },
      },
    };

    expect(getStackAncestors(metadata, "feature/ui")).toEqual(["main", "feature/api", "feature/ui"]);
    expect(getStackChildren(metadata, "feature/api")).toEqual(["feature/docs", "feature/ui"]);
    expect(getStackChildren(metadata, "main")).toEqual(["feature/api", "independent"]);
  });

  it("moves parent and child references when a branch is renamed", async () => {
    const repo = createTempGitRepo("stack-rename");
    const entry = { baseRef: "main", baseSha: "a", explicit: true, createdAt: "" };
    await recordStackEntry(repo, "feature/api", entry, opts);
    await recordStackEntry(repo, "feature/ui", { ...entry, baseRef: "feature/api" }, opts);

    await renameStackEntry(repo, "feature/api", "feature/service", opts);

    const metadata = await readStackMetadata(repo, opts);
    expect(metadata.branches["feature/api"]).toBeUndefined();
    expect(metadata.branches["feature/service"]).toEqual(entry);
    expect(metadata.branches["feature/ui"]?.baseRef).toBe("feature/service");
  });

  it("removes only the requested branch entry", async () => {
    const repo = createTempGitRepo("stack-remove");
    const entry = { baseRef: "main", baseSha: "a", explicit: true, createdAt: "" };
    await recordStackEntry(repo, "feature/api", entry, opts);
    await recordStackEntry(repo, "feature/ui", { ...entry, baseRef: "feature/api" }, opts);

    await removeStackEntry(repo, "feature/api", opts);

    const metadata = await readStackMetadata(repo, opts);
    expect(metadata.branches["feature/api"]).toBeUndefined();
    expect(metadata.branches["feature/ui"]).toBeDefined();
  });
});

describe("resolveCommitSha", () => {
  it("resolves a commit ref and reports invalid refs clearly", async () => {
    const repo = createTempGitRepo("resolve-commit");
    const sha = await resolveCommitSha(repo, "HEAD", opts);

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    await expect(resolveCommitSha(repo, "missing-ref", opts)).rejects.toThrow(
      "Ref 'missing-ref' does not resolve to a commit"
    );
  });
});
