import { describe, it, expect } from "vitest";
import { deriveOwnership } from "../src/lib/owner.js";

describe("deriveOwnership", () => {
  it("returns mine: true for local-only branch", () => {
    const result = deriveOwnership({
      hasRemoteRef: false,
      configUser: "bob",
      localEmail: "bob@example.com",
      remoteAuthorName: "alice",
      remoteAuthorEmail: "alice@example.com",
      prAuthorLogin: "alice",
    });
    expect(result).toEqual({ mine: true, author: null });
  });

  describe("when PR author info is available", () => {
    it("returns mine: true when PR author matches configUser (case-insensitive)", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: "Bob-Smith",
        localEmail: null,
        remoteAuthorName: null,
        remoteAuthorEmail: null,
        prAuthorLogin: "bob-smith",
      });
      expect(result).toEqual({ mine: true, author: null });
    });

    it("returns mine: false and formats author tag when PR author differs from configUser", () => {
      expect(
        deriveOwnership({
          hasRemoteRef: true,
          configUser: "bob",
          localEmail: null,
          remoteAuthorName: null,
          remoteAuthorEmail: null,
          prAuthorLogin: "alice",
        }),
      ).toEqual({ mine: false, author: "@alice" });
    });

    it("falls back to git email if configUser is null", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: "bob@example.com",
        remoteAuthorName: "Alice Doe",
        remoteAuthorEmail: "alice@example.com",
        prAuthorLogin: "alice",
      });
      expect(result).toEqual({ mine: false, author: "Alice Doe" });
    });
  });

  describe("when falling back to git email", () => {
    it("returns mine: true when emails match (case-insensitive)", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: "BOB@example.com",
        remoteAuthorName: "bob",
        remoteAuthorEmail: "bob@example.com",
        prAuthorLogin: null,
      });
      expect(result).toEqual({ mine: true, author: null });
    });

    it("returns mine: false and author name when emails differ", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: "bob@example.com",
        remoteAuthorName: "Alice Doe",
        remoteAuthorEmail: "alice@example.com",
        prAuthorLogin: null,
      });
      expect(result).toEqual({ mine: false, author: "Alice Doe" });
    });

    it("falls back to email prefix when author name is missing", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: "bob@example.com",
        remoteAuthorName: null,
        remoteAuthorEmail: "alice.smith@example.com",
        prAuthorLogin: null,
      });
      expect(result).toEqual({ mine: false, author: "alice.smith" });
    });

    it("returns null if emails are missing or partial", () => {
      const result1 = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: null,
        remoteAuthorName: "Alice Doe",
        remoteAuthorEmail: "alice@example.com",
        prAuthorLogin: null,
      });
      expect(result1).toBeNull();

      const result2 = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: "bob@example.com",
        remoteAuthorName: null,
        remoteAuthorEmail: null,
        prAuthorLogin: null,
      });
      expect(result2).toBeNull();
    });
  });

  describe("when the worktree has local changes", () => {
    it("counts as mine despite a foreign PR author", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: "bob",
        localEmail: "bob@example.com",
        remoteAuthorName: "Alice Doe",
        remoteAuthorEmail: "alice@example.com",
        prAuthorLogin: "alice",
        hasLocalChanges: true,
      });
      expect(result).toEqual({ mine: true, author: null });
    });

    it("counts as mine despite a foreign remote tip author", () => {
      const result = deriveOwnership({
        hasRemoteRef: true,
        configUser: null,
        localEmail: "bob@example.com",
        remoteAuthorName: "Alice Doe",
        remoteAuthorEmail: "alice@example.com",
        prAuthorLogin: null,
        hasLocalChanges: true,
      });
      expect(result).toEqual({ mine: true, author: null });
    });
  });
});
