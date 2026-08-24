import { describe, it, expect } from "vitest";
import { resolveBranchTarget } from "../src/lib/branch-resolution.js";

describe("resolveBranchTarget", () => {
  it("neither -> create-new", () => {
    expect(
      resolveBranchTarget({ localExists: false, remoteExists: false })
    ).toEqual({ kind: "create-new" });
  });

  it("remote-only -> track-remote", () => {
    expect(
      resolveBranchTarget({ localExists: false, remoteExists: true, remoteSha: "abc" })
    ).toEqual({ kind: "track-remote" });
  });

  it("local-only -> use-local", () => {
    expect(
      resolveBranchTarget({ localExists: true, localSha: "def", remoteExists: false })
    ).toEqual({ kind: "use-local" });
  });

  it("both same sha -> track-remote", () => {
    expect(
      resolveBranchTarget({
        localExists: true,
        localSha: "same123",
        remoteExists: true,
        remoteSha: "same123",
      })
    ).toEqual({ kind: "track-remote" });
  });

  it("both diverged -> diverged", () => {
    expect(
      resolveBranchTarget({
        localExists: true,
        localSha: "local123",
        remoteExists: true,
        remoteSha: "remote456",
      })
    ).toEqual({ kind: "diverged", localSha: "local123", remoteSha: "remote456" });
  });
});
