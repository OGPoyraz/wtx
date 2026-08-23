import { describe, it, expect } from "vitest";
import { expandTemplate, TemplateVars } from "../src/lib/template.js";

describe("template", () => {
  const vars: TemplateVars = {
    root: "/home/user/repos",
    repo: "my-repo",
    branch: "feature-branch",
    main: "main",
    wt: "my-repo-wt",
    postfix: "-wt"
  };

  it("expands all 6 variables correctly", () => {
    const template = "{root} {repo} {branch} {main} {wt} {postfix}";
    const expanded = expandTemplate(template, vars);
    expect(expanded).toBe("/home/user/repos my-repo feature-branch main my-repo-wt -wt");
  });

  it("expands multiple occurrences of same variable", () => {
    const template = "{repo}-{repo}-{branch}";
    const expanded = expandTemplate(template, vars);
    expect(expanded).toBe("my-repo-my-repo-feature-branch");
  });

  it("leaves string unchanged when no variables are present", () => {
    const template = "just a normal string without vars";
    const expanded = expandTemplate(template, vars);
    expect(expanded).toBe("just a normal string without vars");
  });

  it("only expands present variables", () => {
    const template = "path is {root}/{repo} only";
    const expanded = expandTemplate(template, vars);
    expect(expanded).toBe("path is /home/user/repos/my-repo only");
  });

  it("expands {port} when defined", () => {
    const varsWithPort = { ...vars, port: 4200 };
    const template = "start server on {port}";
    const expanded = expandTemplate(template, varsWithPort);
    expect(expanded).toBe("start server on 4200");
  });

  it("leaves {port} untouched when undefined", () => {
    const template = "start server on {port}";
    const expanded = expandTemplate(template, vars);
    expect(expanded).toBe("start server on {port}");
  });
});
