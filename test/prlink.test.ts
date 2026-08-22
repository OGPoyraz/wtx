import { describe, it, expect } from "vitest";
import { parseGithubPrLink } from "../src/lib/forge/github.js";
import { parsePrLink, descriptorFor } from "../src/lib/forge/index.js";

describe("parseGithubPrLink", () => {
  it("parses valid github https PR links", () => {
    expect(parseGithubPrLink("https://github.com/ogpoyraz/wtx/pull/42")).toEqual({
      forgeId: "github",
      host: "github.com",
      path: "ogpoyraz/wtx",
      number: 42,
      url: "https://github.com/ogpoyraz/wtx/pull/42",
    });
  });

  it("parses valid github http PR links", () => {
    expect(parseGithubPrLink("http://github.com/ogpoyraz/wtx/pull/42")).toEqual({
      forgeId: "github",
      host: "github.com",
      path: "ogpoyraz/wtx",
      number: 42,
      url: "http://github.com/ogpoyraz/wtx/pull/42",
    });
  });

  it("strips trailing slashes, query, and fragments", () => {
    expect(parseGithubPrLink("https://github.com/owner/repo/pull/123/?foo=bar#fragment")).toEqual({
      forgeId: "github",
      host: "github.com",
      path: "owner/repo",
      number: 123,
      url: "https://github.com/owner/repo/pull/123",
    });
  });

  it("preserves enterprise/bitbucket hosts in ref", () => {
    expect(parseGithubPrLink("https://git.company.com/owner/repo/pull/1")).toEqual({
      forgeId: "github",
      host: "git.company.com",
      path: "owner/repo",
      number: 1,
      url: "https://git.company.com/owner/repo/pull/1",
    });
  });

  it("rejects invalid links", () => {
    expect(parseGithubPrLink("42")).toBeNull();
    expect(parseGithubPrLink("o/r#42")).toBeNull();
    expect(parseGithubPrLink("https://github.com/o/r/pulls/42")).toBeNull();
    expect(parseGithubPrLink("https://github.com/o/r/tree/main")).toBeNull();
    expect(parseGithubPrLink("")).toBeNull();
  });
});

describe("parsePrLink registry", () => {
  it("routes github link to forgeId github", () => {
    expect(parsePrLink("https://github.com/owner/repo/pull/42")).toEqual({
      forgeId: "github",
      host: "github.com",
      path: "owner/repo",
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    });
  });

  it("returns null for unknown formats (e.g. gitlab MR)", () => {
    expect(parsePrLink("https://gitlab.com/owner/repo/-/merge_requests/42")).toBeNull();
  });
});

describe("descriptorFor", () => {
  it("returns the correct descriptor", () => {
    const desc = descriptorFor("github");
    expect(desc).not.toBeNull();
    expect(desc?.id).toBe("github");
  });

  it("returns null for unknown forge", () => {
    expect(descriptorFor("gitlab")).toBeNull();
  });
});
