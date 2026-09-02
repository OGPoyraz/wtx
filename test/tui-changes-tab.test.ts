import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { testRender } from "@opentui/react/test-utils";
import { ChangesContent } from "../src/tui/components/ChangesTab.js";
import { getChangedFiles, getFileDiff } from "../src/lib/changes.js";

vi.mock("../src/lib/changes.js", () => ({
  getChangedFiles: vi.fn(),
  getFileDiff: vi.fn(),
}));

const mockRow = {
  repoName: "wtx",
  branch: "feat/foo",
  path: "/tmp/wtx/feat/foo",
  commitShort: "a1b2c3d",
  isMainCheckout: false,
  isLocked: false,
  isPrunable: false,
  dirtyFiles: [],
  ahead: 0,
  behind: 0,
  prNumber: null,
  prState: null,
  prChecks: null,
  prUrl: null,
  owner: null,
  isPendingCreate: false,
  rebaseStatus: null,
  depsStrategy: "auto",
};

describe("ChangesTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders empty state when no selectedRow", async () => {
    const { captureCharFrame, flush, renderer } = await testRender(
      React.createElement(ChangesContent, { selectedRow: null, isActive: true, focused: true }),
      { width: 80, height: 24 }
    );
    await flush();
    expect(captureCharFrame()).toContain("No worktree selected");
    renderer.destroy();
  });

  it("renders empty state when no changes", async () => {
    vi.mocked(getChangedFiles).mockResolvedValueOnce([]);

    const { captureCharFrame, flush, renderer } = await testRender(
      React.createElement(ChangesContent, { selectedRow: mockRow as any, isActive: true, focused: true }),
      { width: 80, height: 24 }
    );
    
    await flush();
    
    expect(captureCharFrame()).toContain("No changes in working tree");
    renderer.destroy();
  });

  it("renders list and lazy loads diff", async () => {
    vi.mocked(getChangedFiles).mockResolvedValueOnce([
      { path: "src/index.ts", status: "M", added: 2, removed: 1, binary: false },
      { path: "src/types.ts", status: "A", added: 5, removed: 0, binary: false }
    ]);
    
    vi.mocked(getFileDiff).mockResolvedValueOnce({
      path: "src/index.ts",
      scope: "worktree",
      binary: false,
      diff: "diff --git a/src/index.ts b/src/index.ts\n@@ -1,2 +1,3 @@\n-old\n+new\n+added",
      truncated: false
    });

    const { captureCharFrame, flush, mockInput, renderer, waitFor } = await testRender(
      React.createElement(ChangesContent, { selectedRow: mockRow as any, isActive: true, focused: true }),
      { width: 80, height: 24 }
    );

    await flush();

    const output = captureCharFrame();
    expect(output).toContain("src/index.ts");
    expect(output).toContain("src/types.ts");
    expect(output).toContain("diff --git a/src/index.ts");
    
    expect(getChangedFiles).toHaveBeenCalledTimes(1);
    expect(getFileDiff).toHaveBeenCalledTimes(1);
    expect(getFileDiff).toHaveBeenCalledWith({
      repoPath: "/tmp/wtx/feat/foo",
      branch: "feat/foo",
      scope: "worktree",
      filePath: "src/index.ts"
    });

    renderer.destroy();
  });

  it("handles getChangedFiles error", async () => {
    vi.mocked(getChangedFiles).mockRejectedValueOnce(new Error("Git failed"));

    const { captureCharFrame, flush, renderer } = await testRender(
      React.createElement(ChangesContent, { selectedRow: mockRow as any, isActive: true, focused: true }),
      { width: 80, height: 24 }
    );
    
    await flush();
    
    expect(captureCharFrame()).toContain("Error: Error: Git failed");
    renderer.destroy();
  });
});
