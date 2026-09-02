## 2026-09-02
- PR lookup in prune tests required a stub `gh` on PATH; without it, the command reports an auth/config warning and skips pruning.
- Partial workspace-create failures are visible in the CLI summary, but the created worktrees remain on disk so the user can repair them and rerun workspace linking later.
