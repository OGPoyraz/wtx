# Learnings — wtx-next

## [2026-09-02] Session init

### Stack
- TypeScript, Bun runtime, commander + zod v4 + execa
- @opentui/react v0.5.6, React 19, headless TUI testing via vitest
- `bun run test` → 29 files, 285 tests, ~4s
- `bun run typecheck` → clean exit 0
- `bun install --frozen-lockfile` → required at start of any worktree

### Verified bugs (read from source)
- `InputModal.tsx:21` — `value={initialValue ?? ""}` instead of `value={value}` → typed text never shows
- `App.tsx:1163` — filter `<input>` has NO `value` prop (uncontrolled, desyncs on re-render)
- `App.tsx:746-755` — global key handler blanket-returns for ALL keys while `isFiltering`
- `WorktreeTable.tsx:178` — `title="Worktrees"` but pane renders repo blocks
- `TabPane.tsx:59` — `visible={t.id === activeId && t.id === "details"}` → any non-"details" tab is always invisible
- `data.ts:24` — `prCache` module-level, never cleared/bounded; leak in long-lived TUI
- `data.ts:64-83` — PR fetch inside per-repo semaphore critical path blocks row rendering
- `useTerminalSessions.ts` (final return) — bare object literal, new identity on every render
- `useTerminalSessions.ts:366-376` — raw-buffer replay flood on every re-registration
- Session switch glitch: 4 causes (memo leak, replay flood, resize storm, no invalidate)

### opentui upstream issues
- #1187: renderer diff desync → `renderer.forceFullRepaintRequested`
- #1110: rightmost column stale after resize → `terminal.invalidate()`
- #1339: every render walks whole renderable tree (~23% CPU per spinner) → reduce render count

### Config
- `src/types.ts:75` — `version: z.literal(1)` → must become literal(2) with migration
- Migration pattern already exists: `LEGACY_REPO_KEYS` + `migrateLegacyRepoKeys` preprocessor (lines 37-55)
- `TuiConfigSchema` at lines 30-35 — extend here for theme fields

### Key patterns
- All config writes through `saveConfig()` (atomic, AGENTS.md requirement)
- All git ops through `gitExec()`
- NO `as any`, NO `@ts-ignore`
- NO class-based managers — hooks + module functions only
- NO unnecessary comments
- NO `Co-authored-by` in commits (global AGENTS.md)

### Test patterns
- TUI headless tests: `test/tui-interactions.test.ts`, `test/tui-model.test.ts`, `test/useTerminalSessions.test.ts`
- Config tests: `test/config.test.ts`
- Git tests: `test/worktree-setup.test.ts`, `test/rename-worktree.test.ts` (tmpdir + real-git)

### 0.8.10 hotfix commit
- `git show 2c4be00` — defines characterization test scope: paste, rendering, scroll, logs
- T11 (remove all-mount workaround) is the riskiest task; lands LAST after T7-T10 proven

### Wave 1 dependency: none (T1-T6 all independent)
### Wave 2 dependency: T1 (characterization suite must pass first)
### Wave 2 consists of 4 INDEPENDENT revertable commits (T7, T8, T9, T10)

### [2026-09-02] Task 1 characterization
- Characterization suite stays source-text based because OpenTUI native test rendering is unavailable in this runtime.
- Kept four behavior blocks aligned to the hotfix spec: paste, rendering, scroll, logs.
- maxScrollback mutation check confirmed the scroll budget assertion is live and reverts cleanly.

### [2026-09-02] Task 2 config v2 migration
- Config schema now parses v2 while preserving v1 and missing-version configs through a pre-validation zod preprocessor.
- `loadConfig()` logs `migrated config to v2` with `stepProgress`, so quiet mode suppresses migration notices.
- v1 fixture coverage lives in `test/fixtures/config-v1-*.json` and asserts legacy `pr`/`forge`/`pr_repo` migration composes with the version bump.

### [2026-09-02] Task 4 filter input
- OpenTUI global keyboard listeners can return without consuming an event; only `stopPropagation()` prevents the focused renderable from receiving it.
- Filter mode should stop propagation for app-owned escape/return only; printable shortcut keys like `d` and `q` must simply skip app shortcuts and fall through to the focused input.
- The TUI filter input follows the controlled input pattern: `value={filterText}` paired with `onInput={setFilterText}`.

### [2026-09-02] Task 5 left pane title
- `WorktreeTable` title was updated from `Worktrees` to `Repositories` because the pane renders repo blocks, not individual worktrees.
- Source sweep found no stale `"Worktrees"` pane-title matches in `src/` or `test/` after the change.
- `src/tui/components/HelpOverlay.tsx` did not need wording changes for this label.

### [2026-09-02] Task 6 generic tab visibility
- `TabPane` must treat `TabDef.id` generically; hardcoding `details` in the visibility check hides any future registered tab.
- Headless TUI tests can inspect the rendered element tree directly to assert `visible` flags without needing a browser.

### [2026-09-02] Task 7 terminal session API memoization
- `useTerminalSessions` callback dependencies were already stable enough for memoizing the returned API: state-reading callbacks depend on `sessionsByKey`, ref/updater-only callbacks use empty deps, and cleanup is stable.
- OpenTUI native rendering is unavailable in this runtime, so hook referential-stability coverage uses a small React hook mock instead of `@opentui/react/test-utils`.

### [2026-09-02] Task 8 PTY replay removal
- PTY sessions now stream only live chunks to the registered embedded terminal listener; re-registration does not replay historical raw bytes.
- EmbeddedTerminal remains the scrollback authority for PTY sessions, so retaining the same terminal instance across tab switches preserves scrollback without hook-side raw buffers.
- Pipe fallback history remains session.lines via appendPipe; no emulator/raw replay is required there.

### [2026-09-02] Task 9 terminal resize throttling
- Pane resize propagation now uses a trailing-edge scheduler with a 75ms settle window, so divider drag renders reschedule one pending resize instead of walking all sessions every render.
- The scheduler stores latest dimensions separately from React render state and flushes on unmount, preserving the final pane size even if the component exits before the timer fires.
- T10 can attach terminal invalidation via the scheduler's settled callback immediately after the trailing resize pass.

### [2026-09-02] Task 10 invalidate + full repaint recovery
- Switching to a PTY tab should invalidate the newly active embedded terminal once and set `forceFullRepaintRequested` on the renderer to recover diff desync.
- The resize trailing-edge callback is the right place to invalidate all embedded terminals after the pane settles, fixing the stale rightmost column without per-render invalidation.
- OpenTUI's typed renderer accessor for height is `renderer.terminalHeight`; `renderer.height` is the surface size and should not replace the removed `as any` access.

### [2026-09-02] Task 11 bounded terminal mounts
- `useTerminalSessions` still owns both `proc` and `terminal` on the session record; `TerminalView` mount/unmount only registers or unregisters a listener.
- The safe mount policy is active session plus a two-entry recent-session LRU, tracked when changing tabs or creating a new terminal session.
- T11 regression evidence: characterization suite passed (9 tests), full suite passed (30 files, 316 tests), and typecheck passed.

### [2026-09-02] Task 12 session benchmark
- Session switching benchmark can exercise the same `handleSelectTab` path by composing exported `activateTerminalSession` and `updateRecentTerminalSessions` with a small headless React/Bun spawn harness.
- Bun's global `Bun` property is non-configurable, but `Bun.spawn` itself is writable; benchmark mocks should replace `Bun.spawn` directly instead of redefining `globalThis.Bun`.
- Use `bun --silent run bench:session` when evidence must be valid JSON, because plain `bun run` prefixes script execution with `$ bun run ...`.

## T13: Favorites ordering
- `sortBlocks` and `mergeBlocks` now accept an optional `favorites: string[]`. Favorited repos take precedence in the order they appear in the array; non-favorites keep alphabetical order.
- Favorites are loaded via `loadConfig().favorites` from a small `loadFavorites()` helper inside `useWorktrees`. The hook refreshes favorites on every `refresh()` and exposes `applyFavorites()` for immediate keybind-driven re-sorts without triggering a git fetch.
- Toggling in App.tsx: read via `loadConfig()`, mutate the `favorites` array, persist via `saveConfig({...cfg, favorites: nextFavorites})` (atomic tmp+rename), then call `applyFavorites` so the UI reorders instantly.
- Keybind `F` (shift+f) checked BEFORE `f` (fetch) to avoid the fetch handler swallowing the event.
- Star (★) rendered in `WorktreeTable` repo header when `favoriteSet.has(block.repoName)`; kept it inside the same `<text>` node so layout does not break.

### [2026-09-02] Task 14 PR streaming
- Split PR lookup into a second pass: rows are emitted after repo/worktree resolution, then PR hydration streams in per repo and merges back through the hook.
- `useWorktrees` sequence guard is sufficient for stale discard as long as streamed updates check `seq === seqRef.current` before mutating state.
- The dashboard now needs a distinct PR-fetching state separate from “no PR”, so the table can show a loading marker while PR status is still pending.

### [2026-09-02] Task 22 changes scope selector
- `useChangesTabModel` is directly testable with the existing React hook mock; no OpenTUI test utilities are needed.
- Session-only changes scope memory can live as a module-level `Map` keyed by App's existing worktree key, keeping the state inside the hook while mirroring the per-worktree tab behavior.
- The changes core already caches per `(repoPath, branch, scope)`; the TUI hook adds a scope-local file-list cache so cycling back to a loaded scope avoids another `getChangedFiles` call entirely.

## T16 — Theme context extraction

- `ThemeTokensSchema` in `src/types.ts` is a *user-facing partial override* for `custom_theme` (bg/fg/muted/accent/success/warning/error/border/selection).
  The runtime palette in `src/tui/theme.ts` has more keys (bright/dim/borderActive/selectionBg/panelBg/scrim) because opentui components consume the full set directly.
  So the runtime `ThemeTokens` type is defined structurally in `theme.ts`, not via `z.infer<typeof ThemeTokensSchema>`. Mapping from schema to runtime tokens is a T17/T18 concern.
- `ThemeContext` default value = tokyonight tokens. Keeps `useTheme()` safe to call without a provider (matches current hardcoded behavior). T18 will add the provider in App.tsx.
- Backward compat is trivial to preserve: keep exporting `tokens` as the same object literal. All 17 current consumers of `tokens.*` continue working with zero code change.
- Test uses vitest directly (no React rendering) — asserts registry shape, key coverage, and referential-identity between `THEMES.tokyonight` and `tokyonightTokens`.

## T19 — PTY spawn failures
- `useTerminalSessions.createSession()` now records a readable `spawnError` when PTY creation throws so the session stays mounted instead of failing silently.
- `TerminalView` renders `session.spawnError` inline with error styling and keeps the pane alive for non-PTY fallback content.
- Tests cover both the hook state path (`ENOENT`) and the view-level error surfacing so the failure stays visible in the terminal pane.

### [2026-09-02] Task 23 workspace core
- Workspace safety should reuse `safeResolve()` + `isWithin()` for both directions: workspace inside member and member inside workspace.
- Workspace symlink names are derived artifacts; AGENTS.md should be regenerated from actual symlink names, not manifest repo names.
- `verify()` can avoid infinite symlink loops by checking a visited set on each resolved symlink path before following the next target.

## T20 changes library
- Added src/lib/changes.ts as a read-only git diff engine using gitExec for rev-parse, diff, numstat, name-status, and submodule checks.
- Real-git tmpdir tests in test/changes.test.ts cover worktree, staged, base, binary, empty, large truncation, cache invalidation, and readonly status preservation.
- Evidence captured in .sisyphus/evidence/task-20-scopes.txt, task-20-readonly.txt, and task-20-edge-cases.txt.
