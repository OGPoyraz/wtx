import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execa } from "execa";
import { resolveBaseRemote } from "../src/lib/remotes.js";

async function git(cwd: string, ...args: string[]) {
  await execa("git", args, { cwd });
}

describe("resolveBaseRemote", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wtx-test-remotes-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when no remotes exist", async () => {
    await git(tmpDir, "init");
    await expect(resolveBaseRemote(tmpDir, "main")).rejects.toThrow(/Could not determine base remote/);
  });

  it("returns sole remote if only one exists", async () => {
    await git(tmpDir, "init");
    await git(tmpDir, "remote", "add", "random", "https://example.com/repo.git");
    const remote = await resolveBaseRemote(tmpDir, "main");
    expect(remote).toBe("random");
  });

  it("returns origin over random if both exist", async () => {
    await git(tmpDir, "init");
    await git(tmpDir, "remote", "add", "random", "https://example.com/repo.git");
    await git(tmpDir, "remote", "add", "origin", "https://example.com/origin.git");
    const remote = await resolveBaseRemote(tmpDir, "main");
    expect(remote).toBe("origin");
  });

  it("returns upstream over origin if both exist", async () => {
    await git(tmpDir, "init");
    await git(tmpDir, "remote", "add", "origin", "https://example.com/origin.git");
    await git(tmpDir, "remote", "add", "upstream", "https://example.com/upstream.git");
    const remote = await resolveBaseRemote(tmpDir, "main");
    expect(remote).toBe("upstream");
  });

  it("returns configured branch upstream remote over everything else", async () => {
    await git(tmpDir, "init");
    await git(tmpDir, "commit", "--allow-empty", "-m", "init");
    await git(tmpDir, "branch", "-M", "main");
    await git(tmpDir, "remote", "add", "origin", "https://example.com/origin.git");
    await git(tmpDir, "remote", "add", "upstream", "https://example.com/upstream.git");
    await git(tmpDir, "remote", "add", "custom", "https://example.com/custom.git");
    
    await git(tmpDir, "config", "branch.main.remote", "custom");
    
    const remote = await resolveBaseRemote(tmpDir, "main");
    expect(remote).toBe("custom");
  });
});
