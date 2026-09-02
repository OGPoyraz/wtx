## 2026-09-02
- Keep workspace cleanup best-effort: remove/prune/rename must continue even if workspace updates partially fail.
- Use manifest-driven workspace membership lookup instead of path heuristics when unlinking removed worktrees.
- Rename updates workspace membership by removing the old branch and adding the new one for each affected workspace.
- Workspace create should link only successful repo creates after all sequential create attempts finish; failed repos stay out of the manifest, and the manifest is written atomically once.
- `wtx workspace create` accepts `--base`, `--track`, `--local`, and `--deps` so missing member worktrees can be created with the same semantics as `wtx create`.
