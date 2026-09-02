# Workspaces

Workspaces allow you to group related worktrees from different repositories into a single logical directory. This is useful for cross-repo features where you need to coordinate changes across multiple services or libraries.

[← Back to README](../README.md)

## The Workspace Model

A workspace is a physical directory (by default in `~/Repos/wtx-workspaces/`) containing:
- **Symlinks**: Each member worktree is symlinked into the workspace folder.
- **`.wtx-workspace.json`**: A manifest file tracking the workspace version and its members.
- **`AGENTS.md`**: A human-readable (and agent-readable) summary of the workspace members.

### Symlink Strategy
- **Absolute Targets**: Symlinks point to absolute paths of the worktrees. 
- **Portability**: If you move your main repository root, symlinks will break. Use `wtx workspace verify <name>` to detect broken links.
- **Windows Support**: On Windows, `wtx` uses directory junctions instead of symbolic links to avoid requirement for elevated privileges.

## Manifest Format (`.wtx-workspace.json`)

```json
{
  "version": 1,
  "name": "my-feature-workspace",
  "members": [
    { "repo": "my-api", "branch": "feat/auth" },
    { "repo": "my-web", "branch": "feat/auth" }
  ]
}
```

## Commands

### `wtx workspace create <name> --branch <branch>`
Creates worktrees for the specified branch across all managed repositories (or a subset via `--repo`) and links them into a new workspace.
- If a worktree already exists for that branch, it is linked.
- If not, `wtx` creates it first (running hooks and preparing dependencies).

### `wtx workspace ls`
Lists all workspaces, their paths, and their health status (`OK` or `BROKEN`).

### `wtx workspace add <name> <repo> <branch>`
Links an existing worktree into an existing workspace.

### `wtx workspace rm <name> <repo> <branch>`
Removes a member from a workspace. This deletes the symlink and updates the manifest, but **does not** delete the worktree itself.

### `wtx workspace remove <name>`
Deletes the workspace directory and its manifest. Member worktrees are **not** affected.

### `wtx workspace verify <name>`
Checks if all symlinks in the workspace resolve to valid directories. Reports broken links or circular references.
