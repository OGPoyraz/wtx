import { describe, it, expect } from "vitest";
import { Semaphore } from "../src/lib/semaphore.js";

describe("TUI Data pure helpers", () => {
  it("Semaphore restricts concurrency", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxActive = 0;

    const task = async (delay: number) => {
      await sem.acquire();
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, delay));
      active--;
      sem.release();
    };

    await Promise.all([
      task(10), task(10), task(10), task(10)
    ]);

    expect(maxActive).toBe(2);
    expect(active).toBe(0);
  });
});
