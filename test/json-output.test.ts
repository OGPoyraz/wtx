import { describe, it, expect } from "vitest";
import { buildLsJson, type LsJsonInputRepo } from "../src/commands/ls.js";
import { buildStatusJson, type StatusJsonInput } from "../src/commands/status.js";

describe("JSON Output Builders", () => {
  describe("buildLsJson", () => {
    it("should build correct JSON structure for various worktree states", () => {
      const input: LsJsonInputRepo[] = [
        {
          name: "my-frontend",
          mainPath: "/mock/my-frontend",
          worktrees: [
            {
              path: "/mock/my-frontend",
              branch: "main",
              commit: "a1b2c3d4e5f6",
              isLocked: false,
              dirtyFiles: [],
              isMissing: false,
              isError: false,
            },
            {
              path: "/mock/my-frontend-wt/feat-1",
              branch: "feat-1",
              commit: "f7g8h9i0",
              isLocked: false,
              dirtyFiles: ["src/index.ts", "package.json"],
              isMissing: false,
              isError: false,
            },
            {
              path: "/mock/my-frontend-wt/locked-wt",
              branch: "locked-wt",
              commit: "00000000",
              isLocked: true,
              dirtyFiles: [],
              isMissing: false,
              isError: false,
            }
          ],
          prMap: new Map([
            [
              "feat-1",
              {
                number: 42,
                state: "OPEN",
                url: "https://github.com/ogp/my-frontend/pull/42",
                title: "Feat 1",
                authorLogin: "alice",
                isDraft: false,
                checks: { total: 3, pending: 0, failing: 0, passing: 3, state: "SUCCESS" },
                unresolvedThreads: 0,
                updatedAt: "2023-01-01T00:00:00Z"
              }
            ]
          ]),
          ownerships: new Map([
            ["feat-1", { mine: false, author: "alice" }]
          ])
        }
      ];

      const result = buildLsJson(input);

      expect(result).toHaveLength(3);

      // main checkout
      expect(result[0]).toEqual({
        repo: "my-frontend",
        branch: "main",
        sha: "a1b2c3d",
        status: "main",
      });

      // dirty worktree with PR and ownership
      expect(result[1]).toEqual({
        repo: "my-frontend",
        branch: "feat-1",
        sha: "f7g8h9i",
        status: { dirty: 2 },
        pr: { number: 42, state: "OPEN" },
        owner: "alice"
      });

      // locked worktree
      expect(result[2]).toEqual({
        repo: "my-frontend",
        branch: "locked-wt",
        sha: "0000000",
        status: "locked",
      });
    });
  });

  describe("buildStatusJson", () => {
    it("should build correct JSON structure for status output", () => {
      const input: StatusJsonInput = {
        repo: "my-frontend",
        branch: "feat-status",
        dirtyFiles: ["src/app.ts"],
        ahead: 3,
        behind: 1,
        deps: { strategy: "symlinked" },
        rebase: "rebasing",
        prInfo: {
          number: 100,
          state: "MERGED",
          url: "https://github.com/ogp/my-frontend/pull/100",
          title: "Status Test",
          authorLogin: "bob",
          isDraft: false,
          checks: { total: 0, pending: 0, failing: 0, passing: 0, state: "SUCCESS" },
          unresolvedThreads: 2,
          updatedAt: "2023-01-01T00:00:00Z"
        },
        ownership: { mine: false, author: "bob" }
      };

      const result = buildStatusJson(input);

      expect(result).toEqual({
        repo: "my-frontend",
        branch: "feat-status",
        clean: false,
        dirtyFiles: ["src/app.ts"],
        ahead: 3,
        behind: 1,
        deps: { strategy: "symlinked" },
        pr: {
          number: 100,
          state: "MERGED",
          url: "https://github.com/ogp/my-frontend/pull/100",
        },
        owner: "bob",
        rebase: "rebasing"
      });
    });

    it("should handle clean status with no PR or ahead/behind", () => {
      const input: StatusJsonInput = {
        repo: "my-backend",
        branch: "simple-fix",
        dirtyFiles: [],
        ahead: null,
        behind: null,
        deps: { strategy: "installed" },
        rebase: null
      };

      const result = buildStatusJson(input);

      expect(result).toEqual({
        repo: "my-backend",
        branch: "simple-fix",
        clean: true,
        deps: { strategy: "installed" }
      });
    });
  });
});
