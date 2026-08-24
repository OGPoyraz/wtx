import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { goAdapter } from "../src/lib/deps/adapters/go.js";
import { pythonAdapter, resetUvAvailable } from "../src/lib/deps/adapters/python.js";
import { cargoAdapter } from "../src/lib/deps/adapters/cargo.js";
import { existsSync } from "node:fs";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "wtx-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("go adapter", () => {
  it("detects go.mod", () => {
    expect(goAdapter.detect(tmp)).toBe(false);
    writeFileSync(join(tmp, "go.mod"), "module foo");
    expect(goAdapter.detect(tmp)).toBe(true);
  });

  it("definitionsMatch handles missing and equal files", () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    // Both missing -> match
    expect(goAdapter.definitionsMatch(wt, main)).toBe(true);

    writeFileSync(join(main, "go.mod"), "a");
    writeFileSync(join(main, "go.sum"), "b");
    // missing in wt -> mismatch
    expect(goAdapter.definitionsMatch(wt, main)).toBe(false);

    writeFileSync(join(wt, "go.mod"), "a");
    writeFileSync(join(wt, "go.sum"), "b");
    // equal -> match
    expect(goAdapter.definitionsMatch(wt, main)).toBe(true);

    writeFileSync(join(wt, "go.sum"), "c");
    // differ -> mismatch
    expect(goAdapter.definitionsMatch(wt, main)).toBe(false);
  });

  it("currentState maps correctly", () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    writeFileSync(join(main, "go.mod"), "a");
    writeFileSync(join(main, "go.sum"), "b");
    writeFileSync(join(wt, "go.mod"), "a");

    let state = goAdapter.currentState(wt, main);
    expect(state.state).toBe("missing");
    expect(state.repairHint).toContain("run sync to download modules");

    writeFileSync(join(wt, "go.sum"), "c");
    state = goAdapter.currentState(wt, main);
    expect(state.state).toBe("independent");
    expect(state.repairHint).toContain("definitions differ from main");

    writeFileSync(join(wt, "go.sum"), "b");
    state = goAdapter.currentState(wt, main);
    expect(state.state).toBe("installed");
  });

  it("sync honors dryRun and strategy off", async () => {
    const ctx = { wtPath: tmp, mainPath: tmp, dryRun: true, strategy: "auto" as const };
    const res = await goAdapter.sync(ctx);
    expect(res.action).toBe("skipped");
    expect(res.detail).toContain("Dry run");

    const offCtx = { ...ctx, dryRun: false, strategy: "off" as const };
    const res2 = await goAdapter.sync(offCtx);
    expect(res2.action).toBe("skipped");
  });
});

describe("python adapter", () => {
  afterEach(() => {
    resetUvAvailable(undefined);
  });

  it("detects python files", () => {
    expect(pythonAdapter.detect(tmp)).toBe(false);
    
    writeFileSync(join(tmp, "pyproject.toml"), "");
    expect(pythonAdapter.detect(tmp)).toBe(true);
    rmSync(join(tmp, "pyproject.toml"));

    writeFileSync(join(tmp, "requirements.txt"), "");
    expect(pythonAdapter.detect(tmp)).toBe(true);
    rmSync(join(tmp, "requirements.txt"));

    writeFileSync(join(tmp, "requirements-dev.txt"), "");
    expect(pythonAdapter.detect(tmp)).toBe(true);
  });

  it("definitionsMatch matrix", () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    // uv.lock checked first
    writeFileSync(join(main, "uv.lock"), "a");
    writeFileSync(join(wt, "uv.lock"), "a");
    expect(pythonAdapter.definitionsMatch(wt, main)).toBe(true);

    writeFileSync(join(wt, "uv.lock"), "b");
    expect(pythonAdapter.definitionsMatch(wt, main)).toBe(false);

    rmSync(join(main, "uv.lock"));
    rmSync(join(wt, "uv.lock"));

    // then requirements*.txt
    writeFileSync(join(main, "requirements-test.txt"), "req");
    writeFileSync(join(wt, "requirements-test.txt"), "req");
    expect(pythonAdapter.definitionsMatch(wt, main)).toBe(true);

    writeFileSync(join(wt, "requirements-test.txt"), "req2");
    expect(pythonAdapter.definitionsMatch(wt, main)).toBe(false);

    rmSync(join(main, "requirements-test.txt"));
    rmSync(join(wt, "requirements-test.txt"));

    // then pyproject
    writeFileSync(join(main, "pyproject.toml"), "py");
    writeFileSync(join(wt, "pyproject.toml"), "py");
    expect(pythonAdapter.definitionsMatch(wt, main)).toBe(true);
  });

  it("currentState maps correctly and sync without uv fails", async () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    writeFileSync(join(main, "uv.lock"), "a");
    writeFileSync(join(wt, "uv.lock"), "a");
    
    resetUvAvailable(false);
    
    let state = pythonAdapter.currentState(wt, main);
    expect(state.state).toBe("independent");
    expect(state.repairHint).toContain("requires uv");

    const ctx = { wtPath: wt, mainPath: main, dryRun: false, strategy: "auto" as const };
    const syncRes = await pythonAdapter.sync(ctx);
    expect(syncRes.action).toBe("failed");
    expect(syncRes.detail).toContain("requires uv");

    resetUvAvailable(true);
    state = pythonAdapter.currentState(wt, main);
    expect(state.state).toBe("installed"); // since main also lacks .venv

    mkdirSync(join(main, ".venv"));
    state = pythonAdapter.currentState(wt, main);
    expect(state.state).toBe("missing");
    expect(state.repairHint).toContain("hardcoded paths");

    mkdirSync(join(wt, ".venv"));
    state = pythonAdapter.currentState(wt, main);
    expect(state.state).toBe("installed");
  });

  it("sync honors dryRun", async () => {
    resetUvAvailable(true);
    const ctx = { wtPath: tmp, mainPath: tmp, dryRun: true, strategy: "auto" as const };
    writeFileSync(join(tmp, "uv.lock"), "");
    const res = await pythonAdapter.sync(ctx);
    expect(res.action).toBe("skipped");
    expect(res.detail).toContain("Dry run");
  });
});

describe("cargo adapter", () => {
  it("detects Cargo.toml", () => {
    expect(cargoAdapter.detect(tmp)).toBe(false);
    writeFileSync(join(tmp, "Cargo.toml"), "");
    expect(cargoAdapter.detect(tmp)).toBe(true);
  });

  it("definitionsMatch handles Cargo.lock", () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    expect(cargoAdapter.definitionsMatch(wt, main)).toBe(true);

    writeFileSync(join(main, "Cargo.lock"), "a");
    expect(cargoAdapter.definitionsMatch(wt, main)).toBe(false);

    writeFileSync(join(wt, "Cargo.lock"), "a");
    expect(cargoAdapter.definitionsMatch(wt, main)).toBe(true);
  });

  it("currentState transitions", () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    // missing config, missing target -> missing
    let state = cargoAdapter.currentState(wt, main);
    expect(state.state).toBe("missing");

    // independent target dir -> independent
    mkdirSync(join(wt, "target"));
    state = cargoAdapter.currentState(wt, main);
    expect(state.state).toBe("independent");
    expect(state.repairHint).toContain("share build cache");

    // shared target config
    mkdirSync(join(wt, ".cargo"));
    writeFileSync(join(wt, ".cargo", "config.toml"), `[build]\ntarget-dir = "${join(main, "target")}"\n`);
    state = cargoAdapter.currentState(wt, main);
    expect(state.state).toBe("shared-target");
  });

  it("sync writes config and honors dryRun", async () => {
    const main = join(tmp, "main");
    const wt = join(tmp, "wt");
    mkdirSync(main);
    mkdirSync(wt);

    const ctx = { wtPath: wt, mainPath: main, dryRun: true, strategy: "auto" as const };
    const resDry = await cargoAdapter.sync(ctx);
    expect(resDry.action).toBe("skipped");
    expect(resDry.detail).toContain("Dry run");
    expect(existsSync(join(wt, ".cargo", "config.toml"))).toBe(false);

    ctx.dryRun = false;
    const resReal = await cargoAdapter.sync(ctx);
    expect(resReal.action).toBe("linked");
    expect(existsSync(join(wt, ".cargo", "config.toml"))).toBe(true);
    const content = readFileSync(join(wt, ".cargo", "config.toml"), "utf-8");
    expect(content).toContain(`target-dir = "${join(main, "target")}"`);
  });
});
