# CLI Reference

`wtx` provides a rich set of commands for managing multi-repo worktrees.

[← Back to README](../README.md)

## Global Flags

These flags can be used with any command:

- `--verbose`: Show detailed output, including raw Git commands.
- `--dry-run`: Show what would happen without making any changes.
- `-q, --quiet`: Suppress progress indicators and non-essential logs.
- `-v, --version`: Show the version number.
- `-h, --help`: Display help for a command.

## Repository Scoping

Most commands accept a `--repo` flag to scope the operation.
- Omit `--repo` to target all configured repositories.
- Use comma-separated values (e.g., `--repo api,web`) or repeat the flag.
- Running `wtx` inside a managed repository directory automatically scopes it to that repository.

---

## Commands

### `create <branch>`
Create worktrees, sync files, and prepare dependencies.
- `--repo <names>`: Target specific repos.
- `--base <ref>`: Start from a specific ref (default: main branch).
- `--open`: Open the new worktree in your IDE.
- `--ide <name>`: Override the default IDE.
- `--track`: Track an existing remote branch (even if owned by another user).
- `--local`: Use the local branch even if it has diverged from the remote.
- `--deps <strategy>`: Override the default dependency strategy.
- `--agent <name>`: Spawn an AI agent in the new worktree.
- `--prompt <text>`: Initial prompt for the agent.

### `ls`
List all worktrees and their status.
- `--repo <names>`: Filter by repository.
- `--pr`: Show PR information for each worktree.
- `--json`: Machine-readable output.

### `status <branch>`
Show detailed status for a specific branch/worktree.
- `--base <ref>`: Compare against a different base.
- `--json`: Machine-readable output.

### `pull <pr-link>`
Fetch a Pull Request and create its worktree in one command.

### `pull-branch [branch]`
Fast-forward pull the latest changes for a worktree's branch.

### `remove <branch>`
Remove worktrees and clean up empty parent directories.
- `--force`: Force removal even if there are uncommitted changes.
- `--yes`: Skip confirmation prompt.

### `prune`
Remove worktrees whose remote branch has been merged.

### `rebase <branch>`
Fetch the latest changes and rebase the worktree onto its recorded base.
- `--onto <ref>`: Rebase onto an explicit ref instead of the recorded base.

### `rename <old-branch> <new-branch>`
Rename the branch and move the worktree directory to match.

### `sync <branch>`
Re-copy `sync_files` and re-run `post_sync` hooks.

### `deps [branch]`
Manage dependencies for a worktree or the main checkout.
- `--install`: Run the installation script.
- `--symlink`: Use the legacy whole-directory symlink strategy.
- `--json`: Machine-readable output.

### `open <branch>`
Open the worktree directory in your IDE.
- `--ide <name>`: Override default IDE.

### `fetch`
Fetch the main branch for all repositories.

### `prs`
Show Pull Request status across all managed worktrees.
- `--all`: Show all open PRs, not just those with local worktrees.
- `--json`: Machine-readable output.

### `stack <branch>`
Show the recorded parent and descendant branches in a stacked workflow.

### `history`
Show recent action history.
- `--limit <n>`: Number of entries to show.
- `--source <terminal|cli>`: Filter by source.
- `--json`: Machine-readable output.

### `workspace`
Manage cross-repo workspaces (logical groupings of worktrees).
- `create <name> -b <branch>`: Group worktrees into a new workspace.
- `ls`: List all workspaces and their health.
- `add <name> <repo> <branch>`: Add an existing worktree to a workspace.
- `rm <name> <repo> <branch>`: Remove a member from a workspace.
- `remove <name>`: Delete the workspace definition (preserves worktrees).
- `verify <name>`: Check for broken symlinks in a workspace.

### `config`
Manage `wtx` configuration.
- `init`: Run the setup wizard.
- `show`: Show current configuration.
- `set <key> <value>`: Update a config field.
- `add-repo <path>`: Add a new repository to management.
- `remove-repo <name>`: Stop managing a repository.

### `skill`
Manage AI agent skill files.
- `list`: List available skills.
- `show <name>`: Print the skill content.
- `path <name>`: Print the path to the skill file.

### `terminal`
Launch the interactive dashboard.

### `mcp`
Run the MCP server for AI agent integration.

### `init <shell>`
Output shell integration script (for `eval "$(wtx init zsh)"`).
