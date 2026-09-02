# Decisions — wtx-next

## [2026-09-02] Session init

- Session perf: switch <100ms with 3 sessions; idle CPU <5%; zero dropped keystrokes under `yes` flood
- Workspaces: symlink farm at `<root>/wtx-workspaces/<name>/`, overridable via `workspace_root` config key
- Themes: 5 built-in presets (tokyonight, catppuccin-mocha, gruvbox-dark, nord, rose-pine-dawn) + custom override in config.json, live-switchable via `T` keybind
- Changes explorer: READ-ONLY, 3 scopes (working-tree/staged/vs-base), no staging/discard
- Workspace v1 command surface is CLOSED: create/ls/add/rm/remove/verify. Nothing else.
- Config v2: literal(1) → literal(2) with migration + checked-in v1 fixture test
- Session work: 4 INDEPENDENT commits (T7-T10), one per root cause, each revertable, each tested
- T11 (mount only active+recent) lands LAST — riskiest, re-enters 0.8.10 hotfix territory
- Demo GIF: OWNER-ASSIGNED — agents only prepare the placeholder path
- package.json version is 0.1.0 but CHANGELOG is 0.8.10 — fix in T32
# [2026-09-02] Task 12 session benchmark

- Kept CPU and throughput checks reportable in the benchmark script, with hard exits only for `switchMs < 100` and `droppedKeystrokes === 0`; the vitest guard covers switch latency only to avoid flaky CI gating.
- The benchmark uses mocked PTY sessions, not real shells, so switch latency measures deterministic app/session switch code rather than terminal process startup or OS scheduling noise.

## [2026-09-02] Task 15 PR cache TTL + bounds

- PR cache entries now store timestamps and are only used as offline/error fallback for 5 minutes; successful fetches still overwrite the cache on every lookup.
- Cache eviction is oldest-first with a hard cap of 500 entries so long-lived TUI sessions do not accumulate unbounded stale PR metadata.
