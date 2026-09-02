# Issues & Gotchas — wtx-next

## [2026-09-02] Session init

- T11 is the highest-risk task: removing the 0.8.10 workaround ("keep all TerminalView mounted"). If unmounting loses terminal state, STOP and re-plan rather than reintroducing buffer replay.
- Config migration: adding zod fields is NOT automatic backward compat. The version literal must be bumped 1→2 WITH a real migration.
- Windows symlinks: use `fs.symlink(target, path, "junction")` on win32 (works without admin for directories). Do not fail silently.
- T14 and T15 touch the same file (`src/tui/data.ts`). Coordinate — run sequentially if they conflict.
- T9 (throttle resize) must coordinate with T10 (invalidate after resize) — the trailing edge of T9's throttle is where T10's `invalidate()` fires.
- package.json version 0.1.0 is wrong (CHANGELOG says 0.8.10) — do NOT bump it during bug fix tasks; that's T32.
- No tree-sitter grammars beyond fixed list (each is a WASM blob).
- No bundling unrelated changes into one commit.
# [2026-09-02] Task 12 session benchmark

- LSP diagnostics for `package.json` could not run because the configured `biome` language server is not installed in this environment; TypeScript diagnostics were clean for changed TS files.

## [2026-09-02] Task 22 changes scope selector
- Full typecheck surfaced pre-existing workspace/rename type errors in already-modified files; minimal compile-only fixes were applied so the required pre-commit verification can pass.
