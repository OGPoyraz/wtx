import { describe, it, expect } from "vitest";
import {
  isSubmoduleWorktreeError,
  isRecoverableWorktreeRemoveError,
  isMissingWorktreePathError,
} from "../src/lib/worktree-remove.js";

describe("isSubmoduleWorktreeError", () => {
  it("matches the git submodule refusal message", () => {
    expect(
      isSubmoduleWorktreeError("fatal: working trees containing submodules cannot be moved or removed")
    ).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isSubmoduleWorktreeError("fatal: 'x' is not a working tree")).toBe(false);
  });
});

describe("isRecoverableWorktreeRemoveError", () => {
  it("treats submodule errors as recoverable via force retry or rm + prune", () => {
    expect(
      isRecoverableWorktreeRemoveError("fatal: working trees containing submodules cannot be moved or removed")
    ).toBe(true);
  });

  it("still matches already-removed and missing-path cases", () => {
    expect(isRecoverableWorktreeRemoveError("fatal: 'x' is not a working tree")).toBe(true);
    expect(isRecoverableWorktreeRemoveError("fatal: 'x' already removed")).toBe(true);
    expect(isMissingWorktreePathError("ENOENT: no such file or directory")).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isRecoverableWorktreeRemoveError("fatal: some other git failure")).toBe(false);
  });
});
