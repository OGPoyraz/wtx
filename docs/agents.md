# AI Agents & MCP

`wtx` is designed to be a foundation for AI-assisted development, providing agents with isolated, reproducible environments and the tools to manage them.

[← Back to README](../README.md)

## MCP Server

The `wtx mcp` command starts a Model Context Protocol (MCP) server. You can add this to your AI client (like Claude Desktop, OpenCode, or Cursor) to give it control over your worktrees.

### Tools Provided

- **`list_worktrees`**: Lists all worktrees across managed repositories, including their branch, SHA, and dirty state.
- **`worktree_status`**: Gets detailed info for a specific worktree (ahead/behind, dirty files, dependency state).
- **`create_worktree`**: Creates a new worktree for a specific repo/branch/base.
- **`remove_worktree`**: Removes a worktree (requires explicit confirmation and force flag for dirty trees).
- **`rebase_worktree`**: Rebases a worktree against its base.

### Configuration for Claude/OpenCode

```json
{
  "mcpServers": {
    "wtx": {
      "command": "wtx",
      "args": ["mcp"]
    }
  }
}
```

## Spawning Agents

You can hand off a task to a coding agent immediately upon worktree creation:

```bash
wtx create feat/auth --repo my-api --agent claude --prompt "implement OAuth login"
```

The pipeline ensures the worktree is fully prepared (dependencies installed, `.env` synced) before the agent starts.

### Custom Agent Commands
Define your agents in `~/.config/wtx/config.json`:

```json
{
  "agents": {
    "claude": { "command": "claude" },
    "my-agent": { "command": "opencode --model ollama/qwen3" }
  }
}
```

If `tmux` is installed, the agent will launch in a detached session named `wtx-<repo>-<branch>`.

## Skill Files

`wtx` can generate "skill" files (system prompts or rules) for different AI agents:

```bash
# For OpenCode
wtx skill show opencode > ~/.config/opencode/commands/wtx.md

# For Cursor
wtx skill show cursor > .cursor/rules/wtx.mdc

# For Claude
wtx skill show claude >> CLAUDE.md
```

## TUI Integration

While the `a` keybind was removed in version 0.8.9 to favor more explicit control, you can still monitor agent-created worktrees and their status directly from the `wtx terminal` dashboard.
