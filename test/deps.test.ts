import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { detectDepsState, switchToSymlink } from "../src/lib/deps.js";
import { performSafeLink } from "../src/lib/deps/linking.js";
import { getWorkspaceDelta } from "../src/lib/deps/diff.js";
import { createTempDir } from "./setup.js";

describe("deps", () => {
  describe("detectDepsState", () => {
    it("returns 'missing' when no node_modules exists", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("missing");
    });

    it("returns 'symlinked' when node_modules is a valid symlink to main", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      const mainNm = path.join(mainPath, "node_modules");
      fs.mkdirSync(mainNm);
      
      const wtNm = path.join(wtPath, "node_modules");
      fs.symlinkSync(mainNm, wtNm, "dir");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("symlinked");
      expect(state.symlinkTarget).toBe(mainNm);
    });

    it("returns 'broken' when node_modules is a dangling symlink", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      const wtNm = path.join(wtPath, "node_modules");
      const target = path.join(mainPath, "nonexistent");
      fs.symlinkSync(target, wtNm, "dir");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("broken");
      expect(state.symlinkTarget).toBe(target);
    });

    it("returns 'external' when node_modules symlinks outside main checkout", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      const externalPath = createTempDir("wtx-deps-external-");
      
      const wtNm = path.join(wtPath, "node_modules");
      fs.symlinkSync(externalPath, wtNm, "dir");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("external");
      expect(state.symlinkTarget).toBe(externalPath);
    });

    it("returns 'installed' when node_modules is a real directory", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      const wtNm = path.join(wtPath, "node_modules");
      fs.mkdirSync(wtNm);
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("installed");
    });

    it("detects matching lockfiles", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      fs.writeFileSync(path.join(mainPath, "yarn.lock"), "lockfile content");
      fs.writeFileSync(path.join(wtPath, "yarn.lock"), "lockfile content");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.lockfileMatch).toBe(true);
      expect(state.packageManager).toBe("yarn");
    });

    it("detects differing lockfiles", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      fs.writeFileSync(path.join(mainPath, "yarn.lock"), "lockfile content");
      fs.writeFileSync(path.join(wtPath, "yarn.lock"), "different content");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.lockfileMatch).toBe(false);
      expect(state.packageManager).toBe("yarn");
    });

    it("detects when lockfile is missing in one repo", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      fs.writeFileSync(path.join(mainPath, "yarn.lock"), "lockfile content");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.lockfileMatch).toBe(false);
      expect(state.packageManager).toBe("yarn");
    });

    it("detects package managers correctly", () => {
      const pms = [
        { file: "yarn.lock", expected: "yarn" },
        { file: "package-lock.json", expected: "npm" },
        { file: "pnpm-lock.yaml", expected: "pnpm" },
        { file: "bun.lockb", expected: "bun" },
        { file: "bun.lock", expected: "bun" }
      ];

      for (const pm of pms) {
        const mainPath = createTempDir(`wtx-deps-main-${pm.expected}-`);
        const wtPath = createTempDir(`wtx-deps-wt-${pm.expected}-`);
        
        fs.writeFileSync(path.join(wtPath, pm.file), "content");
        
        const state = detectDepsState(wtPath, mainPath);
        expect(state.packageManager).toBe(pm.expected);
      }
    });

    it("detects package manager from main path if wt path is missing it", () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      fs.writeFileSync(path.join(mainPath, "pnpm-lock.yaml"), "content");
      
      const state = detectDepsState(wtPath, mainPath);
      expect(state.packageManager).toBe("pnpm");
    });
  });

  describe("switchToSymlink repairs", () => {
    it("repairs a broken symlink", async () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      
      const mainNm = path.join(mainPath, "node_modules");
      fs.mkdirSync(mainNm);
      
      const wtNm = path.join(wtPath, "node_modules");
      const brokenTarget = path.join(mainPath, "nonexistent");
      fs.symlinkSync(brokenTarget, wtNm, "dir");
      
      let state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("broken");

      await switchToSymlink(wtPath, mainPath, { dryRun: false, verbose: false });
      
      state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("symlinked");
      expect(state.symlinkTarget).toBe(mainNm);
    });

    it("repairs an external symlink", async () => {
      const mainPath = createTempDir("wtx-deps-main-");
      const wtPath = createTempDir("wtx-deps-wt-");
      const externalPath = createTempDir("wtx-deps-external-");
      
      const mainNm = path.join(mainPath, "node_modules");
      fs.mkdirSync(mainNm);
      
      const wtNm = path.join(wtPath, "node_modules");
      fs.symlinkSync(externalPath, wtNm, "dir");
      
      let state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("external");

      await switchToSymlink(wtPath, mainPath, { dryRun: false, verbose: false });
      
      state = detectDepsState(wtPath, mainPath);
      expect(state.strategy).toBe("symlinked");
      expect(state.symlinkTarget).toBe(mainNm);
    });
  });

  describe("safe linking", () => {
    it("creates relative symlinks for top-level entries and .bin", () => {
      const mainPath = createTempDir("wtx-deps-safe-main-");
      const wtPath = createTempDir("wtx-deps-safe-wt-");
      
      const mainNm = path.join(mainPath, "node_modules");
      fs.mkdirSync(mainNm);
      fs.mkdirSync(path.join(mainNm, "foo"));
      fs.writeFileSync(path.join(mainNm, "foo", "package.json"), "{}");
      fs.mkdirSync(path.join(mainNm, "@scope"));
      fs.mkdirSync(path.join(mainNm, "@scope", "bar"));
      fs.writeFileSync(path.join(mainNm, "@scope", "bar", "package.json"), "{}");
      fs.mkdirSync(path.join(mainNm, ".bin"));
      fs.writeFileSync(path.join(mainNm, ".bin", "exec"), "echo");
      
      performSafeLink(wtPath, mainPath, false, true);

      const wtNm = path.join(wtPath, "node_modules");
      expect(fs.existsSync(wtNm)).toBe(true);
      
      expect(fs.lstatSync(path.join(wtNm, "foo")).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(path.join(wtNm, "@scope", "bar")).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(path.join(wtNm, ".bin")).isSymbolicLink()).toBe(true);
    });

    it("does not alter main tree when wt link is removed", () => {
      const mainPath = createTempDir("wtx-deps-safe-main-2-");
      const wtPath = createTempDir("wtx-deps-safe-wt-2-");
      
      const mainNm = path.join(mainPath, "node_modules");
      fs.mkdirSync(mainNm);
      fs.mkdirSync(path.join(mainNm, "foo"));
      
      performSafeLink(wtPath, mainPath, false, true);

      const wtNm = path.join(wtPath, "node_modules");
      fs.rmSync(path.join(wtNm, "foo"), { recursive: true, force: true });
      
      expect(fs.existsSync(path.join(mainNm, "foo"))).toBe(true);
    });
  });

  describe("workspace delta", () => {
    it("detects workspace changes correctly", () => {
      const mainPath = createTempDir("wtx-deps-ws-main-");
      const wtPath = createTempDir("wtx-deps-ws-wt-");
      
      fs.writeFileSync(path.join(mainPath, "package-lock.json"), "root lock");
      fs.writeFileSync(path.join(wtPath, "package-lock.json"), "root lock");
      fs.writeFileSync(path.join(mainPath, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
      fs.writeFileSync(path.join(wtPath, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
      
      fs.mkdirSync(path.join(mainPath, "packages", "a"), { recursive: true });
      fs.writeFileSync(path.join(mainPath, "packages", "a", "package.json"), '{"name":"a"}');
      
      fs.mkdirSync(path.join(wtPath, "packages", "a"), { recursive: true });
      fs.writeFileSync(path.join(wtPath, "packages", "a", "package.json"), '{"name":"a-changed"}');
      
      const delta = getWorkspaceDelta(wtPath, mainPath, ["package-lock.json"]);
      
      expect(delta.rootMatches).toBe(true);
      expect(delta.changedWorkspaces).toContain("packages/a");
    });
  });
});
