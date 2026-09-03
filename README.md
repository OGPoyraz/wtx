# wtx

[![npm version](https://img.shields.io/npm/v/@ogpoyraz/wtx.svg)](https://www.npmjs.com/package/@ogpoyraz/wtx)
[![license](https://img.shields.io/npm/l/@ogpoyraz/wtx.svg)](https://github.com/OGPoyraz/wtx/blob/main/LICENSE)
[![CI status](https://github.com/OGPoyraz/wtx/actions/workflows/ci.yml/badge.svg)](https://github.com/OGPoyraz/wtx/actions)
[![downloads](https://img.shields.io/npm/dm/@ogpoyraz/wtx.svg)](https://www.npmjs.com/package/@ogpoyraz/wtx)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg)](#)

<!-- DEMO GIF: owner-provided. Drop the file at demo/wtx.gif and this will render. -->
![wtx demo](demo/wtx.gif)

`wtx` is a multi-repo git worktree manager with a TUI terminal dashboard built for parallel development. It creates isolated environments across every repository you maintain, ensuring working dependencies, synced `.env` files, and deterministic ports with a single command.

---

## Why not plain `git worktree`?

`git worktree add` gives you a directory—no dependencies, no environment, and no port conflict management.

| | git worktree | single-repo managers | wtx |
|---|---|---|---|
| Multi-repo in one command | – | – | ✓ |
| Working deps after create | manual | hooks only | adapters + safe links |
| `.env` sync from main | manual | some | ✓ |
| Parallel dev-server ports | collide | – | deterministic `{port}` |
| Safe removal (dirty guards) | none | varies | boundary-checked |
| Workspace management | – | – | ✓ symlinked groups |

---

## Installation

```bash
npm install -g @ogpoyraz/wtx
```

### Shell integration

Add to `~/.zshrc`, `~/.bashrc`, or your fish config:

```bash
eval "$(wtx init zsh)"    # or bash, or fish
```

This enables `wtx cd <repo> <branch>` to change directories in your current shell.

### First run

Run any command without a config and `wtx` walks you through setup: it scans common dev directories for git repos, lets you pick which ones to manage, and writes `~/.config/wtx/config.json`. Prefer manual? `wtx config init` starts the same wizard; non-interactive shells print exact steps instead.

---

## Quick Start

```bash
# create a worktree (deps + sync_files handled automatically)
wtx create ogp/my-feature --repo my-frontend

# create a dependent worktree from another branch
wtx create ogp/my-ui --repo my-frontend --base ogp/my-api

# hand it to a coding agent
wtx create ogp/my-feature --repo my-frontend --agent claude --prompt "add OAuth login"

# list everything across all repos
wtx ls

# rebase onto the recorded base (main for independent branches)
wtx rebase ogp/my-feature

# remove when merged — refuses dirty worktrees unless forced
wtx remove ogp/my-feature
```

If origin already has a branch with that name owned by someone else, `wtx` warns and creates your own branch from base instead of tracking theirs. Use `--track` to adopt theirs, or `--local` when local and remote diverged.

---

## Commands

| Command | Args | Flags | Description |
|---|---|---|---|
| `create` | `<branch>` | `--repo`, `--base`, `--open`, `--ide`, `--track`, `--local`, `--agent <name>`, `--prompt <text>`, `--deps <strategy>` | Create worktree(s), sync files, prepare deps, optionally spawn an agent |
| `pull` | `<pr-link>` | `--repo` | Fetch a GitHub PR and create its worktree |
| `pull-branch` | `[branch]` | `--repo` | Fast-forward pull a worktree's branch (auto-detects repo from cwd) |
| `remove` | `<branch>` | `--repo`, `--force`, `--yes` | Remove worktree(s), clean empty dirs |
| `rename` | `<old-branch> <new-branch>` | `--repo` | Rename the branch and move the checkout to the matching new directory |
| `prune` | | `--repo`, `--force`, `--yes` | Remove worktrees whose PR has merged |
| `open` | `<branch>` | `--repo`, `--ide` | Open worktree in IDE |
| `rebase` | `<branch>` | `--repo`, `--onto <ref>` | Rebase worktree onto its recorded base, or an explicit ref |
| `fetch` | | `--repo` | Fetch main for each repo |
| `sync` | `<branch>` | `--repo` | Re-copy sync files, run post-sync hooks |
| `deps` | `[branch]` | `--repo`, `--install`, `--symlink`, `--json` | Inspect or switch dependency strategy; omit the branch and `--install` runs in the main checkout |
| `ls` | | `--repo`, `--pr`, `--json` | List all worktrees with clean/dirty state |
| `status` | `<branch>` | `--repo`, `--base <ref>`, `--json` | Ahead/behind against base, dirty files, rebase state, deps strategy |
| `stack` | `<branch>` | `--repo`, `--json` | Show recorded parent and descendant branches |
| `prs` | | `--repo`, `--json`, `--all` | Pull request status across worktrees |
| `exec` | `<branch> <command...>` | `--repo` | Run a command inside a worktree (`WTX_PORT` injected) |
| `terminal` | | `--wo-details` | Interactive worktree dashboard (requires Bun) |
| `mcp` | | | Run MCP server exposing worktree tools over stdio |
| `cd` | `<repo> <branch>` | | cd into worktree (requires shell integration) |
| `history` | | `--limit`, `--json`, `--source` | Show recent action history (`~/.local/state/wtx/history.jsonl`) |
| `config init/show/set/add-repo/remove-repo` | | | Manage `~/.config/wtx/config.json` |
| `skill list/show/path` | | | Agent skill files for opencode/cursor/claude |
| `init` | `<bash\|zsh\|fish>` | | Output shell wrapper for eval |

**Global flags:** `--verbose`, `--dry-run`, `-q/--quiet`, `-v/--version`, `-h/--help`.

`--repo` accepts comma-separated values or repeats. Omit it to target all configured repos, or run inside a managed repo to auto-scope. Destructive commands (`remove`, `prune`) ask for confirmation on interactive terminals; scripts pass `--yes` or set `WTX_YES=1`.

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
  "user": "ogp",
  "ports": { "min": 4100, "max": 4999 },
  "agents": {
    "claude": { "command": "claude" },
    "reviewer": { "command": "opencode --model ollama/qwen3" }
  },
  "repos": {
    "my-frontend": {
      "main_branch": "auto",
      "sync_files": [".env", ".env.local"],
      "post_create": ["wtx deps"],
      "post_sync": ["wtx deps"],
      "deps": { "manager": "auto", "strategy": "auto" }
    },
    "my-api": {
      "main_branch": "auto",
      "sync_files": [".env"],
      "post_create": ["wtx deps", "docker compose up -d db"]
    },
    "my-go-service": {
      "main_branch": "main"
    },
    "forked-lib": {
      "check_prs": true,
      "forge_provider": "github",
      "pr_lookup_repo": "upstream-owner/lib",
      "install_script": "pnpm install --frozen-lockfile"
    }
  }
}
```

### Fields

| Field | Default | Description |
|---|---|---|
| `root` | required | Base directory where repos live. `~` expanded. |
| `postfix` | `"-wt"` | Worktree directory suffix (`<repo><postfix>/<branch>`) |
| `ide` | `"cursor"` | Default IDE for `wtx open` |
| `default_main_branch` | `"main"` | Fallback when auto-detection fails |
| `user` | `null` | Your forge handle; enables ownership detection |
| `ports.min` / `ports.max` | `4100` / `4999` | Range used by `{port}` isolation |
| `agents.<name>.command` | – | Shell command template for `--agent`; `{wt}`, `{branch}`, `{repo}` expanded |
| `repos.<name>.main_branch` | `"auto"` | Auto-detects via `git symbolic-ref` |
| `repos.<name>.fetch_main_on_create` | `true` | Fetch before creating so branches start fresh |
| `repos.<name>.sync_files` | `[]` | Files or folders copied from main checkout on create and sync — directories are copied recursively (`build/`) |
| `repos.<name>.post_create` / `post_sync` | `[]` | Hook commands; failures fail the command with a rerun hint |
| `repos.<name>.install_script` | `null` | Command run inside a worktree (or the main checkout via `wtx deps --install`) for dependency installs (`{wt}`, `{branch}`, `{main}` expanded); when unset, the detected package manager performs a real install |
| `repos.<name>.deps.manager` | `"auto"` | Force a manager: `npm` `bun` `pnpm` `yarn` `go` `python` `cargo` |
| `repos.<name>.deps.strategy` | `"auto"` | `auto` `link` `symlink` `install` `off` — see below |
| `repos.<name>.check_prs` | `true` | Set `false` to skip all PR lookups for this repo's branches (no `gh` calls) |
| `repos.<name>.forge_provider` | `"auto"` | `"auto"` enables GitHub only when the origin remote is github.com; `"github"` forces GitHub even for other hosts (GitHub Enterprise) |
| `repos.<name>.pr_lookup_repo` | `null` | `owner/repo` override for where PRs are looked up — use when origin points at a fork or mirror |

#### PR lookup keys explained

PR visibility (`wtx prs`, the TUI badges, ownership tags, `prune`) is read-only via the `gh` CLI. Three per-repo keys tune it:

- **`check_prs`** — master switch. `false` disables every `gh` query for this repo; everything else keeps working.
- **`forge_provider`** — which forge hosts the project. `"auto"` only activates GitHub when your origin remote is `github.com`; set `"github"` to force it for GitHub Enterprise or custom domains.
- **`pr_lookup_repo`** — where to look PRs up, as `owner/repo`. Normally derived from origin; override when origin points at your fork but PRs live in the upstream repo.

Legacy configs using `pr`, `forge`, and `pr_repo` keep working — they are migrated automatically on load and rewritten in place on the next config save.

### Template variables

In `post_create`, `post_sync`, and agent commands:

| Variable | Expands to |
|---|---|
| `{root}` `{repo}` `{branch}` `{postfix}` | identity fields |
| `{main}` / `{wt}` | absolute main checkout / worktree paths |
| `{port}` | deterministic collision-free port for this worktree |

Hooks also receive `WTX_PORT` as an environment variable, as does `wtx exec`. Ports hash `repo+branch` into the configured range and probe collisions against every active worktree — two branches can run dev servers simultaneously without conflict, and the same branch always gets the same port.

---

## Dependency syncing

`wtx deps` keeps worktree dependencies working without duplicating installs. Each ecosystem gets its own adapter; detection is lockfile-based and overridable per repo via `deps.manager`.

**Supported today:** npm, bun, pnpm, yarn (Node) · Go (`go mod download`) · Python (`uv sync`; venvs are never symlinked — shebang paths make that unsafe) · Cargo (build cache shared through worktree-local `.cargo/config.toml` pointing at main's `target/`).

### Strategies

| `deps.strategy` | Behavior |
|---|---|
| `auto` | Definitions match main → safe link; differ → install; only some workspaces changed → targeted install |
| `link` | Force safe linking |
| `symlink` | Legacy whole-directory symlink (⚠ installs inside the worktree mutate main's `node_modules`) |
| `install` | Always a real install in the worktree |
| `off` | Leave dependencies alone |

Per-repo `install_script` overrides the install command entirely — useful for non-standard setups (`pnpm install --frozen-lockfile`, bootstrap scripts, codegen steps). It runs inside the worktree (or the main checkout when installing via `wtx deps --install` with no branch) with the same `{wt}` / `{branch}` / `{main}` template expansion as hooks.

### Safe linking (the `auto` default)

When manifests match main, wtx creates a **real** `node_modules` directory in the worktree containing per-package symlinks into main's tree (scoped packages traversed, `.bin` linked). Package-manager operations inside the worktree replace links, never main's files — an `npm install` in one branch cannot damage another checkout. If replacing an existing directory fails mid-way, the original is restored rather than left missing.

Monorepos: `workspaces` globs (including `**`) and `pnpm-workspace.yaml` are parsed; when only some workspaces changed, installs target just those (`-w` / `--filter`). Yarn falls back to a full install.

Inspect any worktree with `wtx deps <branch>`, or add `--json` for machine output. States include `symlinked`, `linked-packages`, `installed`, `broken`, `external`, and `shared-target` — broken and external states come with repair instructions.

---

## AI agents

### Spawn an agent into a fresh worktree

```bash
wtx create feat/auth --repo my-api --agent claude --prompt "implement OAuth login"
```

The full pipeline runs first — create, sync files, prepare dependencies — then the agent launches inside the worktree. With tmux installed it runs in a detached named session (attach hint printed); otherwise directly. If post-create hooks fail, the agent is not spawned: fix with `wtx sync` instead of burning agent tokens on a broken tree. Define custom agents under `agents.<name>` in config.

### MCP server

Expose worktrees to MCP-capable clients (Claude Code, OpenCode, Cursor):

```json
{
  "mcpServers": {
    "wtx": { "command": "wtx", "args": ["mcp"] }
  }
}
```

Tools: `list_worktrees`, `worktree_status`, `create_worktree`, `remove_worktree`, `rebase_worktree`. All operations are scoped to configured repos; `remove_worktree` requires `confirm: true`, plus `force: true` for dirty worktrees.

### Skill files

```bash
wtx skill show opencode > ~/.config/opencode/commands/wtx.md
wtx skill show cursor   > .cursor/rules/wtx.mdc
wtx skill show claude  >> CLAUDE.md
```

---

## Pull request workflow

Read-only PR visibility and lifecycle automation via the [GitHub CLI](https://cli.github.com/) — `wtx` stores no tokens.

```bash
$ wtx prs

  my-frontend
  #42  ogp/my-feature  CONFLICTED · awaiting review  checks 3/3 ✓  2d ago
  #43  ogp/fix-token   IN_REVIEW                     checks 2/3 ✓  5h ago  @alice

  ⚠ 2 open PRs across 1 repo — 1 needs attention
```

Every PR gets one ranked display state (`CONFLICTED`, `CI_FAILING`, `CHANGES_REQUESTED`, ...). Merged and closed PRs surface in `wtx ls --pr` and `wtx status`, so stale worktrees are recognizable at a glance.

Lookups degrade gracefully: if `gh` is missing or unauthenticated you get a warning and everything else keeps working. Fork workflows are covered by `check_prs` / `forge_provider` / `pr_lookup_repo`.

---

## Stacked branches

Worktrees remain sibling directories on disk, while their branches can form a dependency stack:

```bash
wtx create feat/api
wtx create feat/ui --base feat/api

# Open the PRs with these bases:
# feat/api -> main
# feat/ui  -> feat/api
```

`--base` accepts a normal Git ref and uses committed history only; uncommitted files in the parent worktree are not copied. The default remains the configured main branch. `wtx stack feat/ui` shows the recorded local relationship, and `wtx rebase feat/ui` rebases onto the recorded parent instead of flattening the stack onto main. After the parent merges, retarget the child PR to main before rebasing it onto main.

Stack metadata is stored under the repository's common Git directory and is not committed to the project. If a parent branch moves, `wtx status <child>` and the terminal dashboard mark the base as moved. Removing a parent with recorded children is refused unless `--force` is supplied.

---

## Interactive Dashboard

Launch the TUI with `wtx terminal` (requires [Bun](https://bun.sh)). Navigation never locks, and actions run in the background.
`wtx terminal` opens a full-screen dashboard across all configured repos (requires the [Bun](https://bun.sh) runtime).
Pass `--wo-details` for a repositories-only view: the right pane (Details, Changes, terminal sessions) is hidden and the worktree list takes the full width.

| Key | Action |
|---|---|
| `↑/↓, k/j` | Navigate the worktree list |
| `/` | Fuzzy-filter by branch, repo, PR, or owner |
| `Space` | Multi-select for batch operations |
| `p / i / b` | Pull latest / Install deps / Rebase selection |
| `n / d / m` | Create new / Remove / Rename worktree |
| `s / Tab` | Sync env files + hooks / Cycle changes scope |
| `t / T` | New terminal session / Cycle theme presets |
| `F / W` | Pin repo to favorites / Filter by workspace scope |
| `o / c` | Open in IDE / Edit configuration |
| `? / H` | Help overlay / Action history |

---

## CLI Quick Start

```bash
# Create a worktree across repos (deps + sync_files handled)
wtx create feat/auth --repo my-api --repo my-frontend

# Pull a GitHub PR into a fresh worktree
wtx pull https://github.com/owner/repo/pull/123

# Rebase onto the recorded base (or main)
wtx rebase feat/auth

# Safe removal—refuses dirty trees unless --force is used
wtx remove feat/auth
```

---

## Features

- **Dependency Syncing**: Smart adapters for npm, bun, pnpm, yarn, Go, Python, and Cargo. [Read more](docs/configuration.md#dependency-syncing)
- **Stacked Branches**: Record local parent/child relationships for rebasing. [Read more](docs/cli.md#stacked-branches)
- **Port Isolation**: Deterministic `{port}` mapping to prevent dev-server collisions. [Read more](docs/configuration.md#template-variables)
- **Workspace Scope**: Group related worktrees from different repos into logical workspaces. [Read more](docs/workspaces.md)
- **Terminal Sessions**: Embedded PTYs with tab management and LRU mounting. [Read more](docs/terminal.md)
- **AI Readiness**: Native MCP server and skill files for coding agents. [Read more](docs/agents.md)

---

## Documentation

- [CLI Reference](docs/cli.md) — All commands and flags
- [Configuration](docs/configuration.md) — schema, hooks, and template variables
- [Terminal Dashboard](docs/terminal.md) — TUI guide and customization
- [Workspaces](docs/workspaces.md) — Managing multi-repo groups
- [AI Agents](docs/agents.md) — Using wtx with Claude Code, Cursor, and OpenCode

---

## License

MIT
