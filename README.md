# wtx

[![npm version](https://img.shields.io/npm/v/@ogpoyraz/wtx.svg)](https://www.npmjs.com/package/@ogpoyraz/wtx)
[![license](https://img.shields.io/npm/l/@ogpoyraz/wtx.svg)](https://github.com/OGPoyraz/wtx/blob/main/LICENSE)
[![CI status](https://github.com/OGPoyraz/wtx/actions/workflows/ci.yml/badge.svg)](https://github.com/OGPoyraz/wtx/actions)
[![downloads](https://img.shields.io/npm/dm/@ogpoyraz/wtx.svg)](https://www.npmjs.com/package/@ogpoyraz/wtx)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg)](#)

<!-- DEMO GIF: owner-provided. Drop the file at demo/wtx.gif and this will render. -->
![wtx demo](demo/wtx.gif)

`wtx` is a multi-repo git worktree manager built for parallel development. It creates isolated environments across every repository you maintain, ensuring working dependencies, synced `.env` files, and deterministic ports with a single command.

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
eval "$(wtx init zsh)"    # or bash, fish
```

---

## Interactive Dashboard

Launch the TUI with `wtx terminal` (requires [Bun](https://bun.sh)). Navigation never locks, and actions run in the background.

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
