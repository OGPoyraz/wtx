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
