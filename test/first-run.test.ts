import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "stream";
import fs from "fs";
import readline from "readline/promises";
import { runFirstRunWizard } from "../src/lib/first-run.js";
import { loadConfig } from "../src/lib/config.js";
import { createTempDir } from "./setup.js";
import { ConfigSchema } from "../src/types.js";

vi.mock("readline/promises", () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(actual.existsSync),
      readdirSync: vi.fn(actual.readdirSync),
    }
  };
});

describe("runFirstRunWizard", () => {
  let input: PassThrough;
  let output: PassThrough;
  let mockQuestion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
    vi.clearAllMocks();
    
    mockQuestion = vi.fn();
    vi.mocked(readline.createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof readline.createInterface>);

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (typeof path === "string" && path.includes("test-repo/.git")) return true;
      if (typeof path === "string" && path.includes("test-repo")) return true;
      if (typeof path === "string" && path.includes("Repos")) return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockImplementation((path: unknown, options: unknown) => {
      if (typeof path === "string" && path.includes("test-repo")) {
        if (!options) return [".env", ".env.local"] as unknown as fs.Dirent[];
      }
      if (typeof path === "string" && path.includes("Repos")) {
        return [{ name: "test-repo", isDirectory: () => true }] as unknown as fs.Dirent[];
      }
      return [];
    });
  });

  afterEach(() => {
    input.destroy();
    output.destroy();
  });

  it("happy path toggles repos and produces valid config object", async () => {
    mockQuestion
      .mockResolvedValueOnce("1") // toggle repo
      .mockResolvedValueOnce("") // confirm
      .mockResolvedValueOnce("/my/root") // root
      .mockResolvedValueOnce("-wt-test") // postfix
      .mockResolvedValueOnce("vscode") // ide
      .mockResolvedValueOnce("testuser"); // user

    const result = await runFirstRunWizard({ input, output });
    
    expect(ConfigSchema.safeParse(result).success).toBe(true);
    expect(result.repos["test-repo"]).toBeDefined();
    expect(result.repos["test-repo"].sync_files).toContain(".env");
    expect(result.root).toBe("/my/root");
    expect(result.postfix).toBe("-wt-test");
    expect(result.ide).toBe("vscode");
    expect(result.user).toBe("testuser");
  });

  it("empty-selection rejection asks again and skips when requested", async () => {
    mockQuestion
      .mockResolvedValueOnce("") // attempt to confirm empty
      .mockResolvedValueOnce("s") // skip
      .mockResolvedValueOnce("") // root
      .mockResolvedValueOnce("") // postfix
      .mockResolvedValueOnce("") // ide
      .mockResolvedValueOnce(""); // user

    const result = await runFirstRunWizard({ input, output });
    
    expect(Object.keys(result.repos).length).toBe(0);
    expect(result.root).toBe("~/Repos");
    expect(result.ide).toBe("cursor");
  });
});

describe("_resolve-path guard", () => {
  it("skips wizard if _resolve-path is in argv", () => {
    const dir = createTempDir("wtx-missing-config-");
    process.env.XDG_CONFIG_HOME = dir;
    process.env.WTX_NO_WIZARD = "";
    const originalArgv = process.argv;
    process.argv = [...originalArgv, "_resolve-path"];
    
    const isTTYOrig = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      expect(() => loadConfig()).toThrow("Run 'wtx config init' to create one interactively");
    } finally {
      process.stdout.isTTY = isTTYOrig;
      process.argv = originalArgv;
    }
  });

  it("skips wizard if WTX_NO_WIZARD=1", () => {
    const dir = createTempDir("wtx-missing-config-");
    process.env.XDG_CONFIG_HOME = dir;
    process.env.WTX_NO_WIZARD = "1";
    
    const isTTYOrig = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      expect(() => loadConfig()).toThrow("Run 'wtx config init' to create one interactively");
    } finally {
      process.stdout.isTTY = isTTYOrig;
    }
  });
});
