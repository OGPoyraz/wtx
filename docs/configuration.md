# Configuration

`wtx` configuration is stored at `~/.config/wtx/config.json`.

[← Back to README](../README.md)

## v1 → v2 Migration Note

Config version 2 was introduced to standardize field names. Older configs are automatically migrated on load:
- `pr` → `check_prs`
- `forge` → `forge_provider`
- `pr_repo` → `pr_lookup_repo`

A `version: 2` field is added to your config upon the next save.

## Global Configuration

| Field | Default | Description |
|---|---|---|
| `version` | `2` | Configuration schema version. |
| `root` | *required* | Absolute path where your repositories are located. |
| `postfix` | `"-wt"` | Suffix added to worktree base directories (`<repo><postfix>/<branch>`). |
| `ide` | `"cursor"` | Default command or IDE to use with `wtx open`. |
| `default_main_branch` | `"main"` | Fallback branch name if auto-detection fails. |
| `user` | `null` | Your forge handle (e.g., GitHub username) for ownership detection. |
| `favorites` | `[]` | List of repository keys to pin to the top of the TUI dashboard. |
| `workspace_root` | `null` | Override for where `wtx workspace` symlinks are stored (defaults to `root/wtx-workspaces`). |
| `ports.min` / `max` | `4100` / `4999` | Port range for deterministic `{port}` isolation. |

### TUI Settings (`tui`)

| Field | Default | Description |
|---|---|---|
| `leftPaneWidthWeight` | `3` | Relative width of the repository list. |
| `rightPaneWidthWeight` | `7` | Relative width of the details/terminal pane. |
| `theme` | `"tokyonight"` | TUI theme name. |
| `custom_theme` | `null` | Optional object for overriding theme colors (`bg`, `fg`, `accent`, etc.). |

## Repository Configuration (`repos.<name>`)

| Field | Default | Description |
|---|---|---|
| `main_branch` | `"auto"` | Branch used as the source of truth. `"auto"` detects via `git symbolic-ref`. |
| `fetch_main_on_create`| `true` | Fetch the main branch before creating a new worktree. |
| `sync_files` | `[]` | List of files or directories copied from the main checkout (e.g., `.env`). |
| `post_create` | `[]` | Commands run after a worktree is created. |
| `post_sync` | `[]` | Commands run after a `wtx sync`. |
| `install_script` | `null` | Custom command for dependency installation. |
| `check_prs` | `true` | Whether to perform PR lookups via `gh`. |
| `forge_provider` | `"auto"` | `"github"` forces GitHub CLI usage; `"auto"` enables it if origin is GitHub. |
| `pr_lookup_repo` | `null` | `owner/repo` override if the origin points to a fork. |
| `deps.manager` | `"auto"` | Override package manager detection (`npm`, `bun`, `go`, etc.). |
| `deps.strategy` | `"auto"` | Dependency strategy: `auto`, `link`, `symlink`, `install`, `off`. |

## Template Variables

The following variables are expanded in `post_create`, `post_sync`, `install_script`, and agent commands:

| Variable | Expansion |
|---|---|
| `{root}` | The global `root` path. |
| `{repo}` | The repository name. |
| `{branch}` | The current branch name. |
| `{postfix}` | The configured `postfix`. |
| `{main}` | Absolute path to the main repository checkout. |
| `{wt}` | Absolute path to the current worktree. |
| `{port}` | A deterministic, collision-free port assigned to this worktree. |

Variables are also available as environment variables (e.g., `WTX_PORT`).
