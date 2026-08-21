# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/OGPoyraz/wtx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OGPoyraz/wtx/releases/tag/v0.1.0
