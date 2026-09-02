## 2026-09-02
- Workspace manifests must be updated after the git operation succeeds; unlink/update failures should warn and not fail the command.
- `findWorkspacesForMember()` is the safest entry point for fan-out workspace updates because it reuses manifest state instead of inferring symlink names.
- `workspace verify` stays healthy after remove/prune/rename as long as symlinks are removed/rewired and manifests stay in sync.
