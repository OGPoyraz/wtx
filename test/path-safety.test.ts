import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { isWithin, safeResolve } from "../src/lib/path-safety.js";

describe("path-safety", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wtx-path-safety-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("isWithin correctness incl. trailing slashes", () => {
    expect(isWithin("/a/b", "/a/b/c")).toBe(true);
    expect(isWithin("/a/b/", "/a/b/c")).toBe(true);
    expect(isWithin("/a/b", "/a/b/c/")).toBe(true);
  });

  it("sibling-prefix trap", () => {
    expect(isWithin("/a/b", "/a/bc")).toBe(false);
    expect(isWithin("/a/b/", "/a/bc")).toBe(false);
  });

  it("relative vs absolute mixtures", () => {
    const root = path.join(tmpDir, "root");
    const child = path.join(root, "child");
    fs.mkdirSync(child, { recursive: true });

    expect(isWithin(root, child)).toBe(true);
    expect(isWithin(path.relative(process.cwd(), root), child)).toBe(true);
  });

  it("symlinked candidate escape attempt", () => {
    const root = path.join(tmpDir, "root");
    const outside = path.join(tmpDir, "outside");
    const symlinkChild = path.join(root, "symlinkChild");

    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, symlinkChild);

    expect(isWithin(root, symlinkChild)).toBe(false);
  });

  it("nonexistent-path fallback via safeResolve", () => {
    const root = path.join(tmpDir, "root");
    const symlinkToRoot = path.join(tmpDir, "symlink-to-root");
    fs.mkdirSync(root);
    fs.symlinkSync(root, symlinkToRoot);

    const nonexistentChildViaSymlink = path.join(symlinkToRoot, "child", "grandchild");
    
    // We want it to still recognize that the *parent* was symlinked to root.
    expect(isWithin(root, nonexistentChildViaSymlink)).toBe(true);

    const nonexistentSibling = path.join(tmpDir, "root-sibling");
    expect(isWithin(root, nonexistentSibling)).toBe(false);
  });
});
