import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { getLocalBranchSha } from "../src/lib/git.js";

let repo: string;

beforeAll(() => {
  process.env.GIT_AUTHOR_NAME = "wtx-test";
  process.env.GIT_AUTHOR_EMAIL = "wtx-test@example.com";
  process.env.GIT_COMMITTER_NAME = "wtx-test";
  process.env.GIT_COMMITTER_EMAIL = "wtx-test@example.com";

  repo = fs.mkdtempSync(path.join(os.tmpdir(), "wtx-sha-"));
  const run = (cmd: string) => execSync(cmd, { cwd: repo, stdio: "ignore" });
  run("git init -q -b main .");
  run("git commit --allow-empty -m init");
  run("git branch existing-branch");
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

const opts = { verbose: false, dryRun: false };

describe("getLocalBranchSha", () => {
  it("returns sha for an existing local branch", async () => {
    const sha = await getLocalBranchSha(repo, "existing-branch", opts);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns null — never throws — for a missing local branch (regression: show-ref exited 128)", async () => {
    const sha = await getLocalBranchSha(repo, "test-1", opts);
    expect(sha).toBeNull();
  });

  it("returns null under dryRun without touching git", async () => {
    expect(await getLocalBranchSha(repo, "existing-branch", { ...opts, dryRun: true })).toBeNull();
  });
});
