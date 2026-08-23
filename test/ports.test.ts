import { describe, it, expect } from "vitest";
import { hashPort, probe } from "../src/lib/ports.js";

describe("ports", () => {
  describe("hashPort", () => {
    it("is deterministic", () => {
      const h1 = hashPort("repo1/branch-a", 4000, 5000);
      const h2 = hashPort("repo1/branch-a", 4000, 5000);
      expect(h1).toBe(h2);
      
      const h3 = hashPort("repo2/branch-a", 4000, 5000);
      expect(h1).not.toBe(h3);
    });

    it("respects range bounds on many keys", () => {
      for (let i = 0; i < 1000; i++) {
        const p = hashPort(`key-${i}`, 4100, 4999);
        expect(p).toBeGreaterThanOrEqual(4100);
        expect(p).toBeLessThanOrEqual(4999);
      }
    });
  });

  describe("probe", () => {
    it("returns base if not taken", () => {
      expect(probe(4100, new Set(), 4100, 4999)).toBe(4100);
    });

    it("linear probes if taken", () => {
      const taken = new Set([4100, 4101]);
      expect(probe(4100, taken, 4100, 4999)).toBe(4102);
    });

    it("wraps at max", () => {
      const taken = new Set([4999, 4100]);
      expect(probe(4999, taken, 4100, 4999)).toBe(4101);
    });
    
    it("throws if all taken", () => {
      const taken = new Set([4100, 4101, 4102]);
      expect(() => probe(4100, taken, 4100, 4102)).toThrow(/All ports in range/);
    });
  });
});
