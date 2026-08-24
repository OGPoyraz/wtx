# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-08-25

### Added

- Stacked worktrees via `wtx create <branch> --base <ref>` (and `wtx stack <branch>`): create dependent worktrees whose base is any Git ref (committed history only, main remains the default); parent/base recorded in local git-common metadata (`.git/wtx/stack.json`), `wtx status`/`rebase`/`ls`/`prs` and the terminal dashboard are base-aware, `wtx rebase` rebases onto the recorded parent instead of main, `wtx ls` and the dashboard render full-depth hierarchies (e.g. `main → api → ui → tests`), `wtx remove`/`prune` guard against removing a parent with children, `wtx rename` keeps stack metadata in sync, and the base is exposed in JSON/MCP/forge outputs
- Install dependencies in the main checkout: `wtx deps --install` without a branch runs the detected package manager (or the repo's `install_script`) inside the main checkout, and the dashboard install action (`i`) now works on main rows — handy for refreshing main's `node_modules` after pulling new packages so worktrees can keep safe-linking against it

## [0.7.0] - 2026-08-24

### Added

- Worktree rename (`wtx rename <old> <new>` and `m` in the dashboard): renames the branch, moves the checkout to the matching new directory (code carried over), cleans up emptied parent directories, rolls back the branch rename if the move fails, and hints at the stale upstream after the fact
- Branch pull (`wtx pull-branch [branch]` and `p` in the dashboard): fast-forward-only `git pull` inside a worktree; auto-detects the repo from the current directory and fails loudly when it can't, when the worktree doesn't exist, or when the branch diverged (points at `wtx rebase`)
- Per-repo `install_script` config key: command run inside a worktree for dependency installs, with `{wt}` / `{branch}` / `{main}` template expansion; used by `wtx deps --install`, `wtx create --deps install`, and the new dashboard install action
- Dependency strategy picker when creating worktrees from the dashboard: choose Auto (default), Install (real install / `install_script`), or Symlink before creation
- Dashboard install action (`i`): run dependencies install directly on the selected worktree(s) from the detail pane flow

### Fixed

- Dashboard repositories are now always sorted alphabetically — create/delete operations no longer reshuffle repo order
- Rebase conflicts abort cleanly: a failing rebase is rolled back automatically ("Rebase failed — manual merge needed"), the worktree keeps its pre-rebase commits, and `wtx rebase` exits non-zero so scripts and the dashboard surface the failure
- Fetch failures during rebase no longer report a bogus conflict — they're reported as skipped with the fetch error instead

### Changed

- Repo config keys renamed for clarity: `pr` → `check_prs` (master switch for PR lookups), `forge` → `forge_provider` (GitHub Enterprise forcing), `pr_repo` → `pr_lookup_repo` (`owner/repo` override for fork workflows); legacy names are migrated transparently and rewritten on next config save — README documents what each does
- Dashboard history overlay is wider and taller, shows durations, and loads more entries for easier debugging
- Repositories appear immediately when the dashboard opens with a per-repo `refreshing…` indicator while data loads; scoped refreshes show `refreshing` next to affected repos just like fetching/syncing
- Dashboard footer keybinding row sorted alphabetically by action name

## [0.6.1] - 2026-08-24

- Loading state fixes in TUI

## [0.6.0] - 2026-08-24

### Added

- Agent hand-off: `wtx create <branch> --agent <name> [--prompt "..."]` runs the full create pipeline, then spawns the configured coding agent inside the new worktree — in a detached named tmux session when tmux is available; if post-create hooks fail, the agent is not spawned
- Agents registry under `agents.<name>.command` in config with `{wt}`, `{branch}`, `{repo}` template expansion
- MCP server: `wtx mcp` exposes `list_worktrees`, `worktree_status`, `create_worktree`, `remove_worktree`, and `rebase_worktree` over stdio — scoped to configured repos, removal requires explicit confirm (plus force for dirty trees)
- Deterministic port isolation: `{port}` template variable and `WTX_PORT` environment variable hash `repo+branch` into the configured range and probe collisions against active worktrees — two branches can run dev servers simultaneously
- Dependency syncing redesigned around per-ecosystem adapters (npm, bun, pnpm, yarn, Go, Python/uv, Cargo) with lockfile-based detection, overridable via `deps.manager`
- Safe linking strategy: when manifests match main, the worktree gets a real `node_modules` of per-package symlinks into main's tree — installs inside one worktree never mutate another checkout; failed directory replacements restore the original
- Workspace-aware installs: `workspaces` globs (including `**`) and `pnpm-workspace.yaml` are parsed; when only some workspaces changed, installs target just those
- Cargo adapter shares main's build cache through a worktree-local `.cargo/config.toml`; Python venvs are installed, never symlinked
- Guided first-run wizard: any command without a config scans common dev directories, lets you pick which repos to manage, and writes the config atomically
- `wtx exec <branch> <command...>` runs a command inside a worktree with `WTX_PORT` injected
- Persistent action history: mutating commands record to `~/.local/state/wtx/history.jsonl` with automatic rotation at ~5 MB — inspect via `wtx history [--limit] [--json] [--source]` or the `H` key in the terminal dashboard
- Machine-readable output: `wtx ls --json` and `wtx status <branch> --json`; global `-q`/`--quiet` suppresses progress lines
- Destructive commands (`remove`, `prune`) ask for confirmation on interactive terminals; scripts pass `--yes` or set `WTX_YES=1`
- Fish shell integration (`wtx init fish`) alongside updated bash/zsh/fish completions
- Terminal dashboard: fuzzy filter (`/`), multi-select batch rebase/remove/sync (`Space` + `R`/`D`/`s`), agent spawn keybind (`a`)
- Inline progress in the dashboard: busy indicators next to the repo/branch during create, delete, rebase, sync, and refresh — input locked until the operation finishes, failures open a log modal with captured output
- Repo fetches run concurrently with bounded parallelism across `wtx fetch` and dashboard refreshes

### Fixed

- `wtx remove` resolves worktrees by registered branch instead of derived path, fixing removals for non-standard checkout layouts
- `wtx open` opens the main checkout when the requested branch is checked out there instead of failing
- Missing local refs are treated as absent — `git show-ref` exits 128, not 1
- Ownership detection attributes foreign branches via PR author only; the last-commit-author fallback was removed
- Dashboard actions spawn correctly from compiled binaries via a PATH-first launcher
- Broken dependency states are detected with repair instructions; legacy `symlink` strategy keeps its old precedence
- Config rejects semantically invalid values with field-level errors instead of accepting them silently
- Branch resolution on `create` is deterministic and no longer hardcodes `origin`
- Post-create/post-sync hook failures propagate and fail the command with a rerun hint
- Worktree cleanup is contained to resolved worktree roots; port exclusion matches by path instead of derived names
- Security: MCP tool inputs are validated and shell-interpolated values quoted
- `wtx ls` prints guidance when no repositories are configured instead of exiting silently

### Changed

- README rewritten around dependency adapters, agent spawning, MCP, and scripting

## [0.5.0] - 2026-08-23

### Added

- Per-repo config key `fetch_main_on_create` (default `true`) — `wtx create` fetches `origin <main_branch>` first so new branches are based on the latest main; set it to `false` to skip
- Interactive terminal dashboard: new `wtx terminal` command (requires Bun and a TTY) listing every configured repo's worktrees as multi-line entries — branch with status badge (clean / dirty count / locked / missing / rebasing), commit hash, ahead/behind divergence vs main, PR number and state, and ownership tags
- Detail pane per selection: dirty file names, ahead/behind counts, PR display state with checks summary and URL, rebase-in-progress detection, and node_modules strategy
- Keyboard-driven actions streamed inside the dashboard — `n` create, `b` rebase, `d` remove, `s` sync, `o` open in IDE — spawned as child processes with output piped into an action-log pane (stderr highlighted); exit 0 auto-closes and refreshes, failures stay on screen until dismissed; no alternate-screen teardown mid-session
- In-app configuration editor (`c`): edit global keys (`root`, `postfix`, `ide`, `default_main_branch`, `user`) and per-repo settings (`main_branch`, `sync_files`, `post_create`, `post_sync` as comma lists, instant `pr` toggle, `forge` cycle, `pr_repo`), plus add/remove repos — each change validated and persisted through atomic config writes, with automatic worktree refresh afterwards
- Manual-refresh-first data collection bounded at 4 concurrent repos with per-repo/per-worktree failure isolation (`Promise.allSettled`) and a PR cache that survives `gh` rate limits or outages
- Runtime guards: `wtx terminal` fails fast with actionable messages when invoked under Node.js or without an interactive terminal

## [0.4.1] - 2026-08-22

### Added

- `wtx prune [--force]` removes worktrees whose branch has a merged PR — dirty and locked worktrees are skipped without `--force`, and repos with failed forge lookups are left untouched

### Fixed

- Branch ownership now treats a worktree with local modifications (uncommitted or staged files) as yours, instead of mislabeling freshly created worktrees with the remote tip commit author
- PR lookups no longer drop merged and closed PRs: `wtx ls --pr` and `wtx status` show `MERGED`/`CLOSED` tags for stale worktree branches, and `wtx prs --all` actually includes them (default view still lists open PRs only)

## [0.4.0] - 2026-08-22

### Added

- `wtx create --open` (`-o`) opens each created worktree in your IDE after creation — IDE resolved from `--ide`, config `ide`, or `$EDITOR`; respects `--dry-run`
- Read-only PR status for worktree branches: new `wtx prs` command, `wtx ls --pr` flag, and a PR section in `wtx status <branch>`
- `wtx pull <pr-link>` to fetch a GitHub PR by URL and create its worktree, with auto repo detection, merged or closed PR warnings, and fork support without persistent remotes
- Derived display states (`CONFLICTED`, `CI_FAILING`, `CHANGES_REQUESTED`, `AWAITING_REVIEW`, …) ranked by attention priority, with a secondary `awaiting review` tag for open PRs that have no review verdict yet
- Forge adapter layer (`src/lib/forge/`) with GitHub support via the `gh` CLI — auth is fully delegated to `gh`, wtx stores no tokens
- Exact unresolved review-thread counts via one batched GraphQL lookup per repo
- Per-repo config keys: `pr` (default `true`, set `false` to skip lookups), `forge` (`auto` | `github`), `pr_repo` (fork upstream override)
- `wtx prs --json` machine-readable output for scripting and future tooling
- Graceful degradation when `gh` is missing, unauthenticated, slow, or failing — per-repo warnings, exit codes unchanged
- Branch ownership detection: local-only branches count as yours; PR author handle (via new `user` config key) or last-commit author email identifies everyone else
- Owner tags in `wtx ls`, `wtx prs`, and `wtx status` — foreign branches get a dim `@handle`, your branches stay clean; `prs` summary shows a yours/theirs breakdown and `--json` gains an `author` field
- `wtx config set user <handle>` and a prefilled GitHub username prompt during `config init`

### Fixed

- `wtx create` no longer silently adopts a same-named remote branch owned by someone else — it warns and creates your own branch from base instead; pass `--track` to adopt theirs

### Changed

- IDE resolution and spawning extracted into shared helpers used by both `wtx open` and `wtx create --open`

### Fixed

- `wtx ls` now prints a trailing empty line like every other command, so the shell prompt no longer sticks to the last worktree row

## [0.3.0] - 2026-08-21

### Added

- Branch-driven release workflow — create `release/X.X.X` branch, merge to publish
- CI validation for release branches (changelog-only changes, version checks)
- Release process documentation (`RELEASE.md`)
- Tab completions auto-complete existing worktree branch names for `rebase`, `open`, `status`, `remove`, `sync`, and `deps`

### Changed

- Cleaner section headers in output (repo name only, no line drawing)
- All commands output a trailing empty line for cleaner terminal flow
- Simplified README — streamlined installation and examples

### Fixed

- Version now reads from `package.json` at runtime instead of hardcoded constant
- npm package ships bundled JS (`dist/cli.mjs`) for Node.js compatibility
- Scoped npm package name `@ogpoyraz/wtx` (unscoped `wtx` was rejected by npm)
- Release workflow compatible with branch protection (no direct push to main)
- Lockfile uses public npm registry

## [0.2.1] - 2026-08-21

### Fixed

- Version reads from `package.json` at runtime instead of hardcoded constant

## [0.2.0] - 2026-08-21

### Fixed

- npm package bundles JS for Node.js compatibility (no Bun runtime required)
- Release workflow builds `dist/cli.mjs` before npm publish

## [0.1.1] - 2026-08-21

### Fixed

- Scoped npm package name `@ogpoyraz/wtx`
- Release workflow sets version at publish time without pushing to protected main branch

## [0.1.0] - 2026-08-21

### Added

- Core CLI with 11 commands: `config`, `create`, `remove`, `ls`, `init`, `rebase`, `fetch`, `sync`, `deps`, `open`, `status`
- Config system with zod validation and atomic writes (`~/.config/wtx/config.json`)
- Three-way branch resolution on `create` (remote tracking, local branch fallback, new from base)
- Smart `node_modules` management via `deps` (auto-detect symlink vs install based on lockfile comparison)
- Per-repo `sync_files` and `post_create`/`post_sync` hooks with template variable expansion
- Shell wrapper via `eval "$(wtx init zsh)"` for `wtx cd` directory switching
- Auto-detection of current repo from working directory (no `--repo` flag needed when inside a repo)
- Safe `remove` (refuses dirty worktrees without `--force`, cleans empty parent directories)
- `status` command with ahead/behind counts, dirty file listing, and in-progress rebase detection
- `open` command to launch IDE in worktree directory
- AI agent skill files for opencode, cursor, and claude (`wtx skill show <platform>`)
- Bash and zsh tab completions
- CI workflow (typecheck, test, build)
- Release workflow (npm publish, cross-platform binary builds)

[Unreleased]: https://github.com/OGPoyraz/wtx/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/OGPoyraz/wtx/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/OGPoyraz/wtx/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/OGPoyraz/wtx/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/OGPoyraz/wtx/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/OGPoyraz/wtx/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/OGPoyraz/wtx/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/OGPoyraz/wtx/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/OGPoyraz/wtx/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/OGPoyraz/wtx/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/OGPoyraz/wtx/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/OGPoyraz/wtx/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/OGPoyraz/wtx/releases/tag/v0.1.0
