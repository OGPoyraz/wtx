---
description: Manage git worktrees across multiple repos using wtx CLI. Trigger phrases: "create worktree", "remove worktree", "rebase worktree", "list worktrees", "open worktree", "fetch main".
---

# wtx — Worktree Manager

`wtx` is a multi-repo git worktree manager. It allows you to create, manage, and sync git worktrees across multiple repositories concurrently.

## Commands

By default, if you are inside a repository's directory (either the main checkout or a worktree), `wtx` automatically scopes commands to that repository. If you are outside, it will run the command across **all** repositories defined in the config, unless you restrict it using the `--repo` flag.

### `wtx create <branch>`
Creates a new worktree for the specified branch.
- **Flags**:
  - `-r, --repo <repos...>`: Target specific repo(s) (comma-separated or multiple flags).
  - `--base <ref>`: Base ref to create branch from (defaults to tracking remote branch, or creating from `origin/main`).
  - `-o, --open`: Open worktree(s) in IDE after creation.
  - `--ide <editor>`: IDE to open with (used with `--open`).
- **Hooks & Sync**: Automatically copies files specified in `sync_files` from the main checkout, and runs `post_create` hooks.

### `wtx remove <branch>`
Removes a worktree and deletes the branch.
- **Flags**: `-r, --repo <repos...>`

### `wtx ls`
Lists all worktrees across repositories.

### `wtx prs`
Shows pull request status for worktree branches across repositories. Requires the GitHub CLI (`gh`) to be installed and authenticated. Read-only — never modifies PRs.
- **Flags**:
  - `-r, --repo <repos...>`: Target specific repo(s).
  - `--json`: Machine-readable JSON output.
  - `--all`: Include drafts and closed/merged PRs.

`wtx ls --pr` adds a PR column to the worktree listing, and `wtx status <branch>` shows a PR section (state, checks, unresolved threads, URL).

### `wtx status`
Shows git statuses for all worktrees.

### `wtx rebase <branch>`
Fetches the main branch from origin and rebases the given worktree's branch onto it.
- **Flags**: `-r, --repo <repos...>`

### `wtx sync <branch>`
Re-copies `sync_files` from the main checkout to the worktree and runs `post_sync` hooks. Also checks for package lockfile differences if `node_modules` is symlinked.
- **Flags**: `-r, --repo <repos...>`

### `wtx deps [branch]`
Manages the `node_modules` strategy for a worktree. By default, `wtx deps <branch>` shows the current strategy (independent or symlinked) and lockfile status.
- **Flags**:
  - `--install`: Switch to independent `node_modules` and run install (e.g. `npm install`).
  - `--symlink`: Switch to symlinked `node_modules` (points to the main checkout's `node_modules`).

### `wtx open <branch>`
Opens the worktree in your configured IDE.
- **Flags**: `--ide <editor>` (defaults to config or `$EDITOR`), `-r, --repo <repos...>`

### `wtx cd <repo> <branch>`
If shell integration is enabled via `wtx init`, this changes the current directory to the worktree path.

## Configuration

Located at `~/.config/wtx/config.json`:

```json
{
  "version": 1,
  "root": "~/Repos",
  "postfix": "-wt",
  "ide": "cursor",
  "default_main_branch": "main",
  "repos": {
    "my-frontend": {
      "main_branch": "auto",
      "sync_files": [".env", ".env.local"],
      "post_create": ["npm install", "npm run build"]
    },
    "my-backend": {
      "main_branch": "master",
      "post_sync": ["docker-compose restart"]
    }
  }
}
```

### Template Variables
Hooks (`post_create` and `post_sync`) support the following template variables:
- `{root}`: Base directory (`~/Repos`)
- `{repo}`: Repository name
- `{branch}`: Branch name
- `{main}`: Absolute path to the main checkout
- `{wt}`: Absolute path to the worktree
- `{postfix}`: Worktree directory postfix

## Typical Workflows

1. **Creating a feature across repos**:
   ```bash
   wtx create feature-xyz
   ```
   *Creates a `feature-xyz` worktree in every configured repo, syncs `.env` files, and runs post-create hooks.*

2. **Rebasing daily**:
   ```bash
   wtx rebase feature-xyz
   ```
   *Fetches the latest main branch from origin and rebases the `feature-xyz` worktrees.*

3. **Syncing environment variables**:
   If the `.env` file in the main checkout was updated, run:
   ```bash
   wtx sync feature-xyz
   ```

4. **Managing node_modules dependencies**:
   If a worktree requires different dependencies than the main branch (e.g. you're testing an upgrade):
   ```bash
   wtx deps feature-xyz --install
   ```
   *This removes the symlink to the main repo's `node_modules` and does a fresh install isolated to the worktree.*
