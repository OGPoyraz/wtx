import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createTempDir, createTempConfig } from "./setup.js";
import { switchToInstall } from "../src/lib/deps.js";

const opts = { verbose: false, dryRun: false };

let root: string;
let mainPath: string;
let wtRoot: string;
let wtPath: string;

beforeAll(() => {
  process.env.GIT_AUTHOR_NAME = "wtx-test";
  process.env.GIT_AUTHOR_EMAIL = "wtx-test@example.com";
  process.env.GIT_COMMITTER_NAME = "wtx-test";
  process.env.GIT_COMMITTER_EMAIL = "wtx-test@example.com";

  root = createTempDir("wtx-install-script-");
  mainPath = path.join(root, "myrepo");
  fs.mkdirSync(mainPath, { recursive: true });
  execSync("git init -q -b main", { cwd: mainPath, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: mainPath, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: mainPath, stdio: "ignore" });
  fs.writeFileSync(path.join(mainPath, "package.json"), JSON.stringify({ name: "myrepo" }));
  execSync("git add .", { cwd: mainPath, stdio: "ignore" });
  execSync('git commit -q -m init', { cwd: mainPath, stdio: "ignore" });

  wtRoot = path.join(root, "myrepo-wt");
  wtPath = path.join(wtRoot, "feat/x");
  fs.mkdirSync(wtPath, { recursive: true });

  createTempConfig({
    root,
    postfix: "-wt",
    repos: {
      myrepo: {
        main_branch: "auto",
        install_script: `echo installed > marker.txt`,
        check_prs: true,
        forge_provider: "auto",
        pr_lookup_repo: null,
      },
    },
  } as never);
});

describe("switchToInstall with repo install_script", () => {
  it("runs the configured install script inside the worktree and the main checkout", async () => {
    const okWt = await switchToInstall(wtPath, opts);
    expect(okWt).toBe(true);
    expect(fs.existsSync(path.join(wtPath, "marker.txt"))).toBe(true);

    const okMain = await switchToInstall(mainPath, opts);
    expect(okMain).toBe(true);
    expect(fs.existsSync(path.join(mainPath, "marker.txt"))).toBe(true);
  });
});
