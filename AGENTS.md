# wtx — Multi-Repo Git Worktree Manager

CLI tool for managing git worktrees across multiple repositories simultaneously.

## Tech Stack

- TypeScript, Bun runtime
- `commander` for CLI parsing, `zod` for config validation, `chalk` for output, `execa` for shell commands
- Compiled to single binary via `bun build --compile`
- Config at `~/.config/wtx/config.json`

## Project Structure

```
src/
  index.ts              Entry point, commander setup, subcommand registration
  types.ts              Zod schemas, TypeScript types, constants
  commands/             One file per CLI subcommand
    config.ts           wtx config init|show|set|add-repo|remove-repo
    create.ts           wtx create <branch> — three-way branch resolution
    remove.ts           wtx remove <branch> — safe removal with --force
    ls.ts               wtx ls — porcelain parsing, table output
    init.ts             wtx init <bash|zsh> — shell wrapper output
    rebase.ts           wtx rebase <branch> — rebase onto recorded base
    pull.ts             wtx pull <pr-link> — fetch PR, create worktree
    fetch.ts            wtx fetch — fetch origin main
    sync.ts             wtx sync <branch> — re-copy env files + post_sync
    deps.ts             wtx deps — node_modules symlink/install management
    open.ts             wtx open <branch> — open worktree in IDE
    status.ts           wtx status <branch> — ahead/behind, dirty state
    stack.ts            wtx stack <branch> — recorded branch ancestry
  lib/
    config.ts           Config load/save (atomic writes), tilde expansion
    git.ts              Git command wrapper with verbose/dry-run support
    resolver.ts         Resolve repos from --repo flag or cwd, main branch detection
    template.ts         {main}, {wt}, {repo}, {branch} expansion
    log.ts              Colored step output (✓ ⚠ ✗ ◌), repo headers
    deps.ts             Lockfile comparison, symlink detection, install/symlink switching
    worktree-setup.ts   Extracted sync_files + post_create block shared by create/pull
    stack.ts            Local parent/base metadata for stacked branches
share/
  wtx.sh                Shell wrapper for `wtx cd` (sourced via eval)
skills/                 AI agent skill files (opencode, cursor, claude)
completions/            Bash/zsh tab completions
```

## Key Patterns

- All commands use `resolveRepos()` which auto-detects the current repo from cwd when no `--repo` flag is given
- Config uses atomic writes (write to tmp, rename) to prevent corruption
- `wtx create` uses three-way branch resolution: check remote → track if exists, fallback to local branch, or create new from base
- `wtx remove` is safe by default — refuses dirty worktrees without `--force`, cleans up empty parent dirs
- Stacked branches use explicit `--base` refs and local metadata; main remains the default base
- Shell wrapper (`eval "$(wtx init zsh)"`) intercepts `wtx cd` to change directory in parent shell
- Template variables `{main}`, `{wt}`, `{repo}`, `{branch}`, `{root}`, `{postfix}` are expanded in post_create/post_sync commands

## Development

```bash
bun install                          # install deps
bun run dev -- ls                    # run directly
bun run build                        # compile to dist/wtx
bun run test                         # run tests
bun run typecheck                    # type check
```

## Rules

- No `as any` or `@ts-ignore`
- No unnecessary comments — code should be self-documenting
- Match existing log output format (repo headers, step indicators)
- All git operations go through `gitExec()` for verbose/dry-run support
- Config changes must use `saveConfig()` (atomic writes)
