## 2026-09-02
- Workspace manifests must be updated after the git operation succeeds; unlink/update failures should warn and not fail the command.
- `findWorkspacesForMember()` is the safest entry point for fan-out workspace updates because it reuses manifest state instead of inferring symlink names.
- `workspace verify` stays healthy after remove/prune/rename as long as symlinks are removed/rewired and manifests stay in sync.
- Workspace create now reuses the same create pipeline as `wtx create` via `createWorktreeForRepo()`, so sync_files, deps, stack metadata, and post_create hooks stay identical across direct and workspace-driven creation.
- Real-git workspace tests need GitHub-shaped remotes plus `insteadOf` rewrites to keep forge/PR code paths offline but still resolvable.
