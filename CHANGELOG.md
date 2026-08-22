# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `wtx create --open` (`-o`) opens each created worktree in your IDE after creation — IDE resolved from `--ide`, config `ide`, or `$EDITOR`; respects `--dry-run`
- Read-only PR status for worktree branches: new `wtx prs` command, `wtx ls --pr` flag, and a PR section in `wtx status <branch>`
- Derived display states (`CONFLICTED`, `CI_FAILING`, `CHANGES_REQUESTED`, `AWAITING_REVIEW`, …) ranked by attention priority, with a secondary `awaiting review` tag for open PRs that have no review verdict yet
- Forge adapter layer (`src/lib/forge/`) with GitHub support via the `gh` CLI — auth is fully delegated to `gh`, wtx stores no tokens
- Exact unresolved review-thread counts via one batched GraphQL lookup per repo
- Per-repo config keys: `pr` (default `true`, set `false` to skip lookups), `forge` (`auto` | `github`), `pr_repo` (fork upstream override)
- `wtx prs --json` machine-readable output for scripting and future tooling
- Graceful degradation when `gh` is missing, unauthenticated, slow, or failing — per-repo warnings, exit codes unchanged

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

[Unreleased]: https://github.com/OGPoyraz/wtx/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/OGPoyraz/wtx/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/OGPoyraz/wtx/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/OGPoyraz/wtx/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/OGPoyraz/wtx/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/OGPoyraz/wtx/releases/tag/v0.1.0
