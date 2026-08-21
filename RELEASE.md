# Release Process

Releases are driven by `release/X.X.X` branches. No manual workflow triggers or local npm publish needed.

## Steps

1. **Create a release branch**

   ```bash
   git checkout main && git pull
   git checkout -b release/0.3.0
   ```

2. **Update CHANGELOG.md**

   Move everything under `[Unreleased]` into a new version section. Leave `[Unreleased]` empty.

   ```markdown
   ## [Unreleased]

   ## [0.3.0] - 2026-08-22

   ### Added
   - ...

   ### Fixed
   - ...
   ```

   Add the version link at the bottom of the file:

   ```markdown
   [Unreleased]: https://github.com/OGPoyraz/wtx/compare/v0.3.0...HEAD
   [0.3.0]: https://github.com/OGPoyraz/wtx/compare/v0.2.1...v0.3.0
   ```

3. **Push and open PR**

   ```bash
   git add CHANGELOG.md
   git commit -m "release: 0.3.0"
   git push -u origin release/0.3.0
   gh pr create --title "release: 0.3.0"
   ```

4. **CI validates the release branch**

   The `Validate Release Branch` CI job checks:
   - Only `CHANGELOG.md` is changed (no code changes allowed)
   - Tag `v0.3.0` does not already exist
   - `CHANGELOG.md` contains a `[0.3.0]` section
   - `[Unreleased]` section is empty

   If any check fails, the PR cannot be merged.

5. **Merge the PR**

   On merge, the release workflow automatically:
   - Creates git tag `v0.3.0`
   - Creates a GitHub Release with auto-generated notes
   - Publishes `@ogpoyraz/wtx@0.3.0` to npm
   - Builds and attaches platform binaries (linux-x64, darwin-arm64)

## Rules

- Release branches must only modify `CHANGELOG.md` — no code changes
- Version in branch name must match the version in `CHANGELOG.md`
- The `[Unreleased]` section must be empty when releasing
- Each version can only be released once (tags are immutable)
- Releases happen on merge to main, not on branch creation
