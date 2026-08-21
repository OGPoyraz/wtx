# wtx

Multi-repo git worktree manager. Create, remove, and operate on worktrees across all your configured repositories with a single command.

Designed for monorepo-heavy workflows where you regularly context-switch between feature branches across multiple repos. Configurable per-repo hooks handle sync files and dependency installation automatically. Smart `node_modules` handling symlinks when lockfiles match main and falls back to a full install when they don't.

---

## Installation

### npm (recommended)

```bash
npm install -g @ogpoyraz/wtx
```

Requires [Bun](https://bun.sh) runtime. The binary name is `wtx`.

### Compiled binary

Download a prebuilt binary from [GitHub Releases](https://github.com/OGPoyraz/wtx/releases) — no runtime dependencies needed:

```bash
curl -fsSL https://github.com/OGPoyraz/wtx/releases/latest/download/wtx-darwin-arm64 -o /usr/local/bin/wtx
chmod +x /usr/local/bin/wtx
```

Available binaries: `wtx-darwin-arm64`, `wtx-darwin-x64`, `wtx-linux-x64`.

### From source

```bash
git clone https://github.com/OGPoyraz/wtx.git
cd wtx
bun install
make install
```

Compiles a self-contained binary to `/usr/local/bin/wtx`.

### Shell integration

Add to `~/.zshrc` (or `~/.bashrc`):

```bash
eval "$(wtx init zsh)"
```

This installs a shell wrapper that enables `wtx cd` to actually change directories in your current shell session.

### First-time config

```bash
wtx config init
```

Creates `~/.config/wtx/config.json` interactively with your repos and preferences.

---

## Quick Start

Configure a repo:

```bash
wtx config add-repo myrepo \
  --sync-files ".env,.env.local" \
  --post-create "yarn install"
```

Create a worktree across all configured repos:

```bash
wtx create ogp/my-feature
```

List worktrees:

```bash
$ wtx ls

── myrepo ─────────────────────────────────────────────
  main              a1b2c3d  [main checkout]
  ogp/my-feature    e4f5g6h  clean
```

Check status:

```bash
$ wtx status ogp/my-feature

── myrepo ─────────────────────────────────────────────
  Branch:    ogp/my-feature
  Status:    clean
  vs main:   3 ahead, 0 behind
  Deps:      symlinked
```

Rebase against main:

```bash
$ wtx rebase ogp/my-feature

── myrepo ─────────────────────────────────────────────
  ◌ Fetching origin/main...           → a1b2c3d "fix: resolve token issue"
  ◌ Rebasing ogp/my-feature onto main...
  ✓ Rebased                           → 3 commits replayed
```

Remove when done:

```bash
wtx remove ogp/my-feature
```

---

## Commands

| Command | Args | Flags | Description |
|---|---|---|---|
| `create` | `<branch>` | `--repo`, `--base` | Create worktree(s), run post-create hooks |
| `remove` | `<branch>` | `--repo`, `--force` | Remove worktree(s), clean empty dirs |
| `open` | `<branch>` | `--repo`, `--ide` | Open worktree in IDE |
| `rebase` | `<branch>` | `--repo` | Fetch origin main, rebase worktree onto it |
| `fetch` | | `--repo` | Fetch origin main for each repo |
| `sync` | `<branch>` | `--repo` | Re-copy sync files, run post-sync hooks |
| `deps` | `[branch]` | `--repo`, `--install`, `--symlink` | Inspect or switch node_modules strategy |
| `ls` | | `--repo` | List all worktrees with clean/dirty state |
| `status` | `<branch>` | `--repo` | Ahead/behind count, dirty files, rebase state |
| `cd` | `<repo> <branch>` | | cd into worktree (requires shell integration) |
| `config init` | | | Create default config interactively |
| `config show` | | | Print current config |
| `config set` | `<key> <value>` | | Set a top-level config value |
| `config add-repo` | `<name>` | `--sync-files`, `--post-create`, `--post-sync` | Add or update a repo |
| `config remove-repo` | `<name>` | | Remove a repo from config |
| `skill show` | `<platform>` | | Print skill file to stdout |
| `skill path` | `<platform>` | | Print skill file path |
| `skill list` | | | List available platforms |
| `init` | `<bash\|zsh>` | | Output shell wrapper for eval |

**Global flags:** `--verbose` (show git commands as they run), `--dry-run` (show what would happen), `-v` / `--version`, `-h` / `--help`

`--repo` accepts comma-separated values (`--repo a,b`) or can be repeated (`--repo a --repo b`). Omit it to target all configured repos.

---

## Configuration

Config lives at `~/.config/wtx/config.json`.

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
      "post_create": ["wtx deps"],
      "post_sync": ["wtx deps"]
    },
    "my-backend": {
      "main_branch": "auto",
      "sync_files": [".env"],
      "post_create": ["wtx deps"],
      "post_sync": ["wtx deps"]
    },
    "shared-libs": {
      "main_branch": "auto",
      "post_create": ["wtx deps"],
      "post_sync": ["wtx deps"]
    }
  }
}
```

### Fields

| Field | Default | Description |
|---|---|---|
| `version` | `1` | Config schema version |
| `root` | required | Base directory where repos live. `~` is expanded at read time. |
| `postfix` | `"-wt"` | Suffix appended to repo name for the worktree directory |
| `ide` | `"cursor"` | IDE binary to use for `wtx open`. Overrideable per-command with `--ide`. |
| `default_main_branch` | `"main"` | Fallback when auto-detection fails |
| `repos.<name>.main_branch` | `"auto"` | `"auto"` detects via `git symbolic-ref refs/remotes/origin/HEAD`, or set explicitly |
| `repos.<name>.sync_files` | `[]` | Files copied from main checkout to worktree on create and sync |
| `repos.<name>.post_create` | `[]` | Commands run after worktree creation (cwd = worktree) |
| `repos.<name>.post_sync` | `[]` | Commands run after sync. Falls back to `post_create` if not set. |

### Template variables

Available in `post_create` and `post_sync` command strings:

| Variable | Expands to |
|---|---|
| `{root}` | Value of `root` config key |
| `{repo}` | Repo name (e.g. `my-frontend`) |
| `{branch}` | Worktree branch name |
| `{main}` | Absolute path to main checkout |
| `{wt}` | Absolute path to the worktree |
| `{postfix}` | Value of `postfix` config key |

---

## Smart Dependencies

`wtx deps` manages `node_modules` per worktree without wasting disk space.

**Auto-detect mode** (called automatically from `post_create`):

- Compares the worktree's lockfile against the main checkout
- If they match: symlinks `node_modules` from main (`ln -s`)
- If they differ: runs the appropriate install command (`yarn install`, `npm install`, `pnpm install`, or `bun install`)

Lockfile detection order: `yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`/`bun.lock`. If none found, deps are skipped.

**Inspect current state:**

```bash
$ wtx deps ogp/my-feature

── my-frontend ─────────────────────────────────────────
  node_modules: symlinked             → ~/Repos/my-frontend/node_modules
  yarn.lock:    matches main

── my-backend ──────────────────────────────────────────
  node_modules: independent
  yarn.lock:    differs from main
```

**Explicit switches:**

```bash
# Switch from symlink to full install
wtx deps ogp/my-feature --repo my-frontend --install

# Switch back to symlink (frees disk space)
wtx deps ogp/my-feature --repo my-frontend --symlink
```

When `wtx sync` detects that a symlinked worktree now has a diverged lockfile, it warns you:

```
  ⚠ yarn.lock differs from main — node_modules is symlinked
    Run: wtx deps ogp/my-feature --repo my-frontend --install
```

---

## Shell Integration

`wtx init <zsh|bash>` outputs a shell wrapper function. Sourcing it via `eval` enables `wtx cd`.

```bash
# ~/.zshrc
eval "$(wtx init zsh)"
```

The wrapper intercepts `wtx cd <repo> <branch>` and runs the `cd` in your current shell (a subprocess can't change the parent's directory). All other subcommands are passed through to the `wtx` binary unchanged.

```bash
# Navigate to a worktree
wtx cd my-frontend ogp/my-feature

# Equivalent to:
cd ~/Repos/my-frontend-wt/ogp/my-feature
```

If the worktree doesn't exist:

```
✗ No worktree at ~/Repos/my-frontend-wt/ogp/nonexistent
```

---

## AI Agent Skills

`wtx` ships with skill files for AI coding agents. Install the skill for your platform so the agent understands the `wtx` CLI and can run worktree operations on your behalf.

```bash
$ wtx skill list
Available skills:
  opencode    AI agent skill for opencode
  cursor      AI agent skill for cursor
  claude      AI agent skill for claude code
```

**opencode:**

```bash
wtx skill show opencode >> ~/.config/opencode/skills/wtx.md
```

**Cursor:**

```bash
wtx skill show cursor >> .cursor/rules/wtx.mdc
```

**Claude Code:**

```bash
wtx skill show claude >> CLAUDE.md
```

`wtx skill path <platform>` prints the path to the installed skill file (only available when installed via `make install`). Use `wtx skill show` to get the content regardless of install method.

---

## cwd Auto-Detection

If you run a `wtx` command from inside a repo directory without `--repo`, it scopes to that repo automatically.

```bash
cd ~/Repos/my-frontend
wtx create ogp/my-feature     # only creates for my-frontend
wtx ls                         # only lists my-frontend worktrees
```

Outside a configured repo directory, commands without `--repo` target all configured repos.

---

## License

MIT
