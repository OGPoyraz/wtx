# Terminal Dashboard

The `wtx terminal` command opens an interactive dashboard for managing worktrees across all repositories.

[← Back to README](../README.md)

## Interface Layout

- **Left Pane**: Repositories and worktrees table. Shows status, PR info, and dirty state.
- **Right Pane**: Details and Terminal tabs.
  - **Details**: Shows worktree metadata, PR description, and a Changes explorer.
  - **Terminal**: Interactive PTY sessions (up to 5 per worktree).

### Repositories-only mode

`wtx terminal --wo-details` hides the right pane and stretches the repositories table
full-width. Terminal sessions (`t`) and the Changes view are unavailable in this mode —
use it when you only need the worktree list and lifecycle actions (`n`/`d`/`m`/`p`/`b`/`s`/`i`/`f`).

## Keybindings

### Navigation and Selection
| Key | Action |
|---|---|
| `↑/↓`, `k/j` | Navigate worktree list |
| `/` | Fuzzy-filter entries (branch, repo, PR, owner) |
| `Space` | Multi-select for batch operations |
| `Ctrl+G` | Toggle focus between table and active terminal |
| `Esc` | Clear selection or close active modal |
| `q` | Quit the dashboard |

### Operations
| Key | Action |
|---|---|
| `n` | Create a new worktree (interactive strategy picker) |
| `d` / `D` | Remove selected worktree(s) (refuses dirty unless forced) |
| `m` | Rename selected worktree (branch + directory) |
| `o` | Open selected worktree in IDE |
| `p` | Pull latest changes for selected branch(es) |
| `P` | Pull a PR from a URL |
| `b` / `R` | Rebase selected onto recorded base (or main) |
| `s` | Sync selected (copy env files and run post-sync hooks) |
| `i` | Install dependencies in selected worktrees |
| `f` | Fetch main branch for selected repository |

### Dashboard Settings
| Key | Action |
|---|---|
| `F` | Toggle favorite (pins repository to the top) |
| `T` | Cycle through available themes |
| `W` | Toggle or pick workspace scope |
| `c` | Open configuration editor |
| `r` | Refresh data manually |
| `H` | Show action history |
| `?` | Show help overlay |

### Terminal Tabs
| Key | Action |
|---|---|
| `t` | Create a new terminal session |
| `click tab` | Switch between Details and Terminal sessions |

## Changes Explorer
In the **Details** tab, you can view a read-only diff of changes.
- Press `s` or `Tab` while the Changes section is active to cycle the diff scope:
  - **Worktree**: Changes in your worktree vs. HEAD.
  - **Staged**: Changes staged for commit vs. HEAD.
  - **Base**: Changes in HEAD vs. the recorded base branch.

## Terminal Sessions
Each worktree can host multiple terminal sessions.
- Sessions use real PTYs and remain active in the background.
- Tabs are managed with an LRU strategy for mounting/unmounting visible PTYs.
- Focused terminals receive all keyboard input except `Ctrl+G` (to escape focus).

## Troubleshooting
- **Rebase Conflicts**: If a rebase fails due to conflicts, `wtx` automatically aborts the rebase and restores the worktree to its previous state. A log modal will show the failure details.
- **Data Warnings**: If a background operation (like a PR lookup) fails, a warning count appears in the footer. Press `e` to view the warnings.
- **Busy Repos**: Operations are queued per repository. A repository marked as busy will reject conflicting actions until the current one completes.
