# wtx

Multi-repo git worktree manager built for parallel development — human or AI.

Create isolated worktrees across every repo you maintain, with working dependencies, synced env files, deterministic ports, and one-command hand-off to coding agents like Claude Code, Codex, OpenCode, or Cursor.

```
$ wtx create feat/auth --agent claude

  my-api
  ◌ Fetching origin/main...
  ✓ Worktree created           → ~/Repos/my-api-wt/feat/auth
  ✓ Synced .env
  ✓ Safely linked 214 packages
✓ Done — agent spawned in tmux session wtx-my-api-feat-auth
```

---

## Why not plain `git worktree`?

`git worktree add` gives you a directory — no dependencies, no `.env`, no port-conflict solution, no cleanup discipline. Every wrapper solves one slice.

| | git worktree | single-repo managers | wtx |
|---|---|---|---|
| Multi-repo in one command | – | – | ✓ |
| Working deps after create | manual | hooks only | adapters + safe links |
| `.env` sync from main | manual | some | ✓ |
| Parallel dev-server ports | collide | – | deterministic `{port}` |
| Safe removal (dirty guards) | none | varies | boundary-checked |
| Spawn coding agents | – | some | ✓ tmux-aware |
| MCP server for agents | – | – | ✓ |

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

# hand it to a coding agent
wtx create ogp/my-feature --repo my-frontend --agent claude --prompt "add OAuth login"

# list everything across all repos
wtx ls

# rebase onto main when origin moves
wtx rebase ogp/my-feature

# remove when merged — refuses dirty worktrees unless forced
wtx remove ogp/my-feature
```

If origin already has a branch with that name owned by someone else, `wtx` warns and creates your own branch from base instead of tracking theirs. Use `--track` to adopt theirs, or `--local` when local and remote diverged.

---

## Commands

| Command | Args | Flags | Description |
|---|---|---|---|
| `create` | `<branch>` | `--repo`, `--base`, `--open`, `--ide`, `--track`, `--local`, `--agent <name>`, `--prompt <text>` | Create worktree(s), sync files, prepare deps, optionally spawn an agent |
| `pull` | `<pr-link>` | `--repo` | Fetch a GitHub PR and create its worktree |
| `remove` | `<branch>` | `--repo`, `--force`, `--yes` | Remove worktree(s), clean empty dirs |
| `prune` | | `--repo`, `--force`, `--yes` | Remove worktrees whose PR has merged |
| `open` | `<branch>` | `--repo`, `--ide` | Open worktree in IDE |
| `rebase` | `<branch>` | `--repo` | Fetch base remote main, rebase worktree onto it |
| `fetch` | | `--repo` | Fetch main for each repo |
| `sync` | `<branch>` | `--repo` | Re-copy sync files, run post-sync hooks |
| `deps` | `[branch]` | `--repo`, `--install`, `--symlink`, `--json` | Inspect or switch dependency strategy |
| `ls` | | `--repo`, `--pr`, `--json` | List all worktrees with clean/dirty state |
| `status` | `<branch>` | `--repo`, `--json` | Ahead/behind, dirty files, rebase state, deps strategy |
| `prs` | | `--repo`, `--json`, `--all` | Pull request status across worktrees |
| `exec` | `<branch> <command...>` | `--repo` | Run a command inside a worktree (`WTX_PORT` injected) |
| `terminal` | | | Interactive worktree dashboard (requires Bun) |
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
| `repos.<name>.sync_files` | `[]` | Files copied from main checkout on create and sync |
| `repos.<name>.post_create` / `post_sync` | `[]` | Hook commands; failures fail the command with a rerun hint |
| `repos.<name>.deps.manager` | `"auto"` | Force a manager: `npm` `bun` `pnpm` `yarn` `go` `python` `cargo` |
| `repos.<name>.deps.strategy` | `"auto"` | `auto` `link` `symlink` `install` `off` — see below |
| `repos.<name>.pr` | `true` | Skip PR lookups for this repo |
| `repos.<name>.forge` / `pr_repo` | `"auto"` / `null` | GitHub Enterprise and fork workflows |

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

```bash
wtx pull https://github.com/OGPoyraz/wtx/pull/11   # PR → worktree in one command
wtx prune                                          # remove worktrees whose PR merged
```

Lookups degrade gracefully: if `gh` is missing or unauthenticated you get a warning and everything else keeps working. Fork workflows are covered by `forge` / `pr_repo`.

---

## Terminal dashboard

`wtx terminal` opens a full-screen dashboard across all configured repos (requires the [Bun](https://bun.sh) runtime).

| Key | Action |
|---|---|
| `/` | Fuzzy-filter entries by branch, repo, PR, owner |
| `Space` | Multi-select for batch operations |
| `R` / `D` / `s` | Batch rebase / remove / sync selection |
| `n` | Create worktree |
| `b` | Rebase selected |
| `a` | Spawn coding agent in selected worktree |
| `H` | Action history (recent actions across CLI and dashboard) |
| `o` | Open in IDE |
| `c` | Edit configuration |
| `?` / `q` | Help / quit |

Actions run in the background — navigation never locks. Progress shows inline: `fetching` next to the repo header, `deleting` / `rebasing` / `syncing` next to the branch (dimmed while busy), and a new worktree appears immediately as a `(creating)` row. One operation runs per repo at a time; conflicting actions are rejected with a toast until it finishes. On failure a log modal opens with the captured output; press any key to dismiss. Destructive ones confirm first.

---

## Scripting

Machine-readable output where it matters: `wtx ls --json`, `wtx status <branch> --json`, `wtx deps <branch> --json`, `wtx prs --json`. Combine with `-q` to suppress progress lines, and preview anything destructive with `--dry-run` — including planned deletions and hook commands.

### Action history

Mutating commands (`create`, `remove`, `rebase`, `sync`, `pull`, ...) are recorded to `~/.local/state/wtx/history.jsonl` — whether you ran them from your shell or from inside `wtx terminal` (entries are tagged with their source). Inspect with `wtx history --limit 50 --json --source terminal`, or press `H` in the dashboard. The file rotates automatically at ~5 MB, keeping the newest entries.

---

## License

MIT
