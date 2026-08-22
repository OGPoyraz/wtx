# wtx

Multi-repo git worktree manager. Create, remove, and operate on worktrees across multiple repositories with a single command.

Configurable per-repo hooks handle sync files and dependency installation automatically. Smart `node_modules` handling symlinks when lockfiles match main and falls back to a full install when they don't.

---

## Installation

```bash
npm install -g @ogpoyraz/wtx
```

### Shell integration

Add to `~/.zshrc` (or `~/.bashrc`):

```bash
eval "$(wtx init zsh)"
```

This enables `wtx cd` to change directories in your current shell session.

### First-time config

```bash
wtx config init
```

Creates `~/.config/wtx/config.json` interactively.

---

## Quick Start

Configure a repo:

```bash
wtx config add-repo my-frontend \
  --sync-files ".env,.env.local" \
  --post-create "yarn install"
```

Create a worktree:

```bash
wtx create ogp/my-feature --repo my-frontend
```

List worktrees:

```bash
$ wtx ls

  my-frontend
  main              a1b2c3d  [main checkout]
  ogp/my-feature    e4f5g6h  clean
```

Check status:

```bash
$ wtx status ogp/my-feature

  my-frontend
  Branch:    ogp/my-feature
  Status:    clean
  vs main:   3 ahead, 0 behind
  Deps:      symlinked
```

Rebase against main:

```bash
$ wtx rebase ogp/my-feature

  my-frontend
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
| `ls` | | `--repo`, `--pr` | List all worktrees with clean/dirty state |
| `status` | `<branch>` | `--repo` | Ahead/behind count, dirty files, rebase state |
| `prs` | | `--repo`, `--json`, `--all` | Show pull request status across worktrees |
| `cd` | `<repo> <branch>` | | cd into worktree (requires shell integration) |
| `config init` | | | Create default config interactively |
| `config show` | | | Print current config |
| `config set` | `<key> <value>` | | Set a top-level config value |
| `config add-repo` | `<name>` | `--sync-files`, `--post-create`, `--post-sync` | Add or update a repo |
| `config remove-repo` | `<name>` | | Remove a repo from config |
| `skill show` | `<platform>` | | Print skill file to stdout |
| `skill list` | | | List available platforms |
| `init` | `<bash\|zsh>` | | Output shell wrapper for eval |

**Global flags:** `--verbose`, `--dry-run`, `-v` / `--version`, `-h` / `--help`

`--repo` accepts comma-separated values (`--repo a,b`) or can be repeated (`--repo a --repo b`). Omit it to target all configured repos, or run from inside a repo directory to auto-scope.

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
    }
  }
}
```

### Fields

| Field | Default | Description |
|---|---|---|
| `root` | required | Base directory where repos live. `~` expanded at read time. |
| `postfix` | `"-wt"` | Suffix for the worktree directory (`<repo><postfix>/`) |
| `ide` | `"cursor"` | Default IDE for `wtx open` |
| `default_main_branch` | `"main"` | Fallback when auto-detection fails |
| `repos.<name>.main_branch` | `"auto"` | Auto-detects via `git symbolic-ref`, or set explicitly |
| `repos.<name>.sync_files` | `[]` | Files copied from main checkout on create and sync |
| `repos.<name>.post_create` | `[]` | Commands run after worktree creation |
| `repos.<name>.post_sync` | `[]` | Commands run after sync (falls back to `post_create`) |
| `repos.<name>.pr` | `true` | Set `false` to skip pull request lookups for this repo |
| `repos.<name>.forge` | `"auto"` | Forge adapter: `auto` (detects github.com) or `github` to force |
| `repos.<name>.pr_repo` | `null` | Override base repo for PR lookups, e.g. `"org/upstream"` (fork workflows) |

### Template variables

Available in `post_create` and `post_sync` commands:

| Variable | Expands to |
|---|---|
| `{root}` | Config `root` value |
| `{repo}` | Repo name |
| `{branch}` | Worktree branch name |
| `{main}` | Absolute path to main checkout |
| `{wt}` | Absolute path to the worktree |
| `{postfix}` | Config `postfix` value |

---

## Smart Dependencies

`wtx deps` manages `node_modules` per worktree. Auto-detect mode (used in `post_create`) compares lockfiles — symlinks when they match main, runs install when they differ.

```bash
wtx deps ogp/my-feature                              # inspect
wtx deps ogp/my-feature --repo my-frontend --install  # force install
wtx deps ogp/my-feature --repo my-frontend --symlink   # force symlink
```

---

## Pull Request Status

Read-only PR visibility for your worktrees. Requires the [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated — `wtx` stores no tokens and delegates all auth to `gh`.

```bash
$ wtx prs

  my-frontend
  #42  ogp/my-feature  CONFLICTED · awaiting review  checks 3/3 ✓  2d ago
  #43  ogp/fix-token   IN_REVIEW                     checks 2/3 ✓ · 1 thread  5h ago

  my-backend
  #17  ogp/api-retry   APPROVED                      checks 5/5 ✓  1h ago

  ⚠ 3 open PRs across 2 repos — 1 needs attention
```

Every PR gets one display state, ranked by attention priority: `MERGED`, `CLOSED`, `DRAFT`, `CONFLICTED`, `CI_FAILING`, `CHANGES_REQUESTED`, `CI_RUNNING`, `IN_REVIEW`, `APPROVED`, `AWAITING_REVIEW`. Open PRs without a review verdict yet also show a dim `awaiting review` tag.

- `--json` — machine-readable output
- `--all` — include drafts and closed/merged PRs
- `wtx ls --pr` — adds a PR column to the worktree listing
- `wtx status <branch>` — shows the PR section (state, checks, unresolved threads, URL)

Lookups never break commands: if `gh` is missing, unauthenticated, or times out, you get a per-repo warning and everything else keeps working. Private repos work out of the box through your existing `gh auth login`; GitHub Enterprise and fork workflows are covered by the `forge` / `pr_repo` config keys above.

## AI Agent Skills

```bash
wtx skill list                                         # list platforms
wtx skill show opencode > ~/.config/opencode/commands/wtx.md
wtx skill show cursor > .cursor/rules/wtx.mdc
wtx skill show claude >> CLAUDE.md
```

---

## License

MIT
