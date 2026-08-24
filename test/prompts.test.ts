import { describe, it, expect, vi } from "vitest";
import { confirm, isInteractive, ConfirmIO, canProceedDeletion } from "../src/lib/prompts.js";
import { PassThrough } from "stream";

describe("prompts", () => {
  describe("isInteractive", () => {
    it("returns true when both stdin and stdout are TTY", () => {
      const originalStdin = process.stdin.isTTY;
      const originalStdout = process.stdout.isTTY;
      
      process.stdin.isTTY = true;
      process.stdout.isTTY = true;
      expect(isInteractive()).toBe(true);

      process.stdin.isTTY = originalStdin;
      process.stdout.isTTY = originalStdout;
    });

    it("returns false if stdout is not TTY", () => {
      const originalStdin = process.stdin.isTTY;
      const originalStdout = process.stdout.isTTY;
      
      process.stdin.isTTY = true;
      process.stdout.isTTY = false;
      expect(isInteractive()).toBe(false);

      process.stdin.isTTY = originalStdin;
      process.stdout.isTTY = originalStdout;
    });

    it("returns false if stdin is not TTY", () => {
      const originalStdin = process.stdin.isTTY;
      const originalStdout = process.stdout.isTTY;
      
      process.stdin.isTTY = false;
      process.stdout.isTTY = true;
      expect(isInteractive()).toBe(false);

      process.stdin.isTTY = originalStdin;
      process.stdout.isTTY = originalStdout;
    });
  });

  describe("confirm", () => {
    const createIO = () => {
      const input = new PassThrough();
      const output = new PassThrough();
      return { input, output };
    };

    it("accepts 'y'", async () => {
      const io = createIO();
      const promise = confirm("Proceed?", io);
      io.input.write("y\n");
      const result = await promise;
      expect(result).toBe(true);
    });

    it("accepts 'yes' case-insensitive", async () => {
      const io = createIO();
      const promise = confirm("Proceed?", io);
      io.input.write("YeS\n");
      const result = await promise;
      expect(result).toBe(true);
    });

    it("rejects 'n'", async () => {
      const io = createIO();
      const promise = confirm("Proceed?", io);
      io.input.write("n\n");
      const result = await promise;
      expect(result).toBe(false);
    });

    it("rejects 'no' case-insensitive", async () => {
      const io = createIO();
      const promise = confirm("Proceed?", io);
      io.input.write("NO\n");
      const result = await promise;
      expect(result).toBe(false);
    });

    it("rejects on Enter (default n)", async () => {
      const io = createIO();
      const promise = confirm("Proceed?", io);
      io.input.write("\n");
      const result = await promise;
      expect(result).toBe(false);
    });

    it("rejects on EOF", async () => {
      const io = createIO();
      const promise = confirm("Proceed?", io);
      io.input.end();
      const result = await promise;
      expect(result).toBe(false);
    });
  describe("canProceedDeletion", () => {
    it("returns true if yesFlag is true regardless of interactivity", () => {
      expect(canProceedDeletion({ interactive: false, yesFlag: true, envYes: false })).toBe(true);
      expect(canProceedDeletion({ interactive: true, yesFlag: true, envYes: false })).toBe(true);
    });

    it("returns true if envYes is true regardless of interactivity", () => {
      expect(canProceedDeletion({ interactive: false, yesFlag: false, envYes: true })).toBe(true);
      expect(canProceedDeletion({ interactive: true, yesFlag: false, envYes: true })).toBe(true);
    });

    it("returns true if interactive is true even without flags", () => {
      expect(canProceedDeletion({ interactive: true, yesFlag: false, envYes: false })).toBe(true);
    });

    it("returns false if non-interactive and no flags provided", () => {
      expect(canProceedDeletion({ interactive: false, yesFlag: false, envYes: false })).toBe(false);
    });
  });
});
});
