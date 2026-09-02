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
  - `--track`: Track the remote branch even if ownership detection says it belongs to someone else.
- **Hooks & Sync**: Automatically copies files specified in `sync_files` from the main checkout, and runs `post_create` hooks.

### `wtx remove <branch>`
Removes a worktree and deletes the branch.
- **Flags**: `-r, --repo <repos...>`

### `wtx ls`
Lists all worktrees across repositories. Owned-by-someone-else branches show a dim `@handle` suffix.

### `wtx prs`
Shows pull request status for worktree branches across repositories. Requires the GitHub CLI (`gh`) to be installed and authenticated. Read-only — never modifies PRs.
- **Flags**:
  - `-r, --repo <repos...>`: Target specific repo(s).
  - `--json`: Machine-readable JSON output with an `author` field.
  - `--all`: Include drafts and closed/merged PRs.

`wtx ls --pr` adds a PR column to the worktree listing, `wtx prs` shows the same dim owner tag per row and a mixed-ownership summary, and `wtx status <branch>` shows a PR section (state, checks, unresolved threads, URL, owner line for foreign branches). Worktrees with local modifications count as yours. Use `wtx config set user <handle>` to enable ownership tags.

`wtx prune [--force]` removes worktrees whose branch has a merged PR. Dirty or locked worktrees are skipped without `--force`; repos with failed PR lookups are left untouched.

### `wtx pull <pr-link>`
Fetches a GitHub PR by URL and creates its worktree.
- **Flags**: `-r, --repo <repo>`, `--force`
- Supports fork PRs without adding persistent remotes.

### `wtx pull-branch <branch>`
Fetches a branch from origin and creates a worktree.
- **Flags**: `-r, --repo <repos...>`

### `wtx rename <branch> <new-name>`
Renames a worktree's branch and its directory.
- **Flags**: `-r, --repo <repos...>`

### `wtx terminal`
Opens an interactive full-screen dashboard for browsing and acting on worktrees across all configured repos. Requires Bun runtime and a TTY.

- Lists worktrees with status badges (dirty, missing, rebasing, etc.), commit info, divergence, PR status, and owner tags.
- Navigation: `j/k` or arrows · `/` fuzzy-filter · `Space` multi-select.
- Actions: `n` create · `p` pull · `P` pull PR · `b` rebase · `d` remove · `s` sync · `i` install · `m` rename · `o` open · `r` refresh · `f` fetch.
- Layout: `c` config · `F` favorite repo · `W` workspace scope · `t` new terminal · `T` cycle theme · `s/Tab` cycle changes scope · `?` help.
- Destructive actions confirm before running; output streams inside the dashboard.

### `wtx workspace`
Manage groups of worktrees as logical workspaces using symlinks.
- **`wtx workspace create <name> --branch <branch>`**: Creates worktrees across repos and links them.
- **`wtx workspace ls`**: Lists workspaces and their health status.
- **`wtx workspace add <name> <repo> <branch>`**: Links an existing worktree into a workspace.
- **`wtx workspace rm <name> <repo> <branch>`**: Unlinks a member from a workspace.
- **`wtx workspace remove <name>`**: Deletes the workspace directory (preserves member worktrees).
- **`wtx workspace verify <name>`**: Checks for broken member links.

### `wtx status`
Shows git statuses for all worktrees.

### `wtx rebase <branch>`
Fetches the configured main branch for an independent worktree, or rebases onto its recorded base for a stacked worktree.
- **Flags**: `-r, --repo <repos...>`, `--onto <ref>` to override the base.

### `wtx stack <branch>`
Shows the recorded parent and descendant branches for a worktree.
- **Flags**: `-r, --repo <repos...>`, `--json`

### `wtx history`
Shows a log of recent wtx actions.

### `wtx mcp`
Starts the wtx MCP server for integration with AI agents.

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
  "version": 2,
  "root": "~/Repos",
  "postfix": "-wt",
  "ide": "cursor",
  "default_main_branch": "main",
  "user": "myhandle",
  "favorites": ["my-frontend"],
  "workspace_root": "~/Workspaces",
  "tui": {
    "theme": "tokyonight"
  },
  "repos": {
    "my-frontend": {
      "main_branch": "auto",
      "sync_files": [".env", ".env.local"],
      "post_create": ["npm install"]
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
   *Fetches the latest main branch for independent work, or uses the recorded parent for a stacked branch.*

3. **Creating a stacked branch**:
   ```bash
   wtx create feature-api
   wtx create feature-ui --base feature-api
   wtx stack feature-ui
   ```
   *Open the child PR against `feature-api`; after the parent merges, retarget the child to main before rebasing it onto main.*

4. **Syncing environment variables**:
   If the `.env` file in the main checkout was updated, run:
   ```bash
   wtx sync feature-xyz
   ```

5. **Managing node_modules dependencies**:
   If a worktree requires different dependencies than the main branch (e.g. you're testing an upgrade):
   ```bash
   wtx deps feature-xyz --install
   ```
   *This removes the symlink to the main repo's `node_modules` and does a fresh install isolated to the worktree.*
