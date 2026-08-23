import { describe, it, expect } from "vitest";
import {
  resolveAgentCommand,
  listAvailableAgents,
  buildAgentCommand,
  tmuxSessionName,
  buildTmuxArgs,
  DEFAULT_AGENTS
} from "../src/lib/agents.js";

describe("agents", () => {
  it("resolves built-in agents", () => {
    expect(resolveAgentCommand("claude")).toBe("claude");
    expect(resolveAgentCommand("codex")).toBe("codex");
  });

  it("resolves configured agents with precedence over built-ins", () => {
    const config = {
      claude: { command: "custom-claude" },
      myagent: { command: "my-agent-cmd" }
    };
    
    expect(resolveAgentCommand("claude", config)).toBe("custom-claude");
    expect(resolveAgentCommand("myagent", config)).toBe("my-agent-cmd");
  });

  it("returns null for unknown agents", () => {
    expect(resolveAgentCommand("unknown")).toBeNull();
  });

  it("lists all available agents", () => {
    const config = {
      myagent: { command: "my-agent-cmd" }
    };
    
    const available = listAvailableAgents(config);
    expect(available).toContain("claude");
    expect(available).toContain("codex");
    expect(available).toContain("opencode");
    expect(available).toContain("cursor");
    expect(available).toContain("myagent");
  });

  it("buildAgentCommand expands variables and escapes prompts", () => {
    // Basic expansion
    expect(buildAgentCommand("agent {wt} {branch} {repo}", "/tmp/wt", undefined, {
      branch: "feat/foo",
      repo: "my-repo"
    })).toBe("agent /tmp/wt feat/foo my-repo");
    
    // Prompt with double quotes
    expect(buildAgentCommand("agent {wt}", "/tmp/wt", 'Hello "world"!')).toBe(
      'agent /tmp/wt "Hello \\"world\\"!"'
    );
  });
  
  it("buildAgentCommand works with original 3-arg signature", () => {
    expect(buildAgentCommand("agent {wt}", "/tmp/wt", "my prompt")).toBe(
      'agent /tmp/wt "my prompt"'
    );
    expect(buildAgentCommand("agent {wt}", "/tmp/wt")).toBe("agent /tmp/wt");
  });

  it("tmuxSessionName sanitizes appropriately", () => {
    expect(tmuxSessionName("my-repo", "feat/x.y:z")).toBe("wtx-my-repo-feat-x-y-z");
    
    const longBranch = "a".repeat(100);
    const session = tmuxSessionName("repo", longBranch);
    expect(session.length).toBe(60);
    expect(session.startsWith("wtx-repo-")).toBe(true);
  });

  it("buildTmuxArgs returns correct array shape", () => {
    const args = buildTmuxArgs("my-session", "/tmp/wt", "agent /tmp/wt");
    expect(args).toEqual([
      "new-session",
      "-d",
      "-s",
      "my-session",
      "-c",
      "/tmp/wt",
      "agent /tmp/wt"
    ]);
  });
});
