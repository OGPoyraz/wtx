## 2026-09-02
- Keep workspace cleanup best-effort: remove/prune/rename must continue even if workspace updates partially fail.
- Use manifest-driven workspace membership lookup instead of path heuristics when unlinking removed worktrees.
- Rename updates workspace membership by removing the old branch and adding the new one for each affected workspace.
