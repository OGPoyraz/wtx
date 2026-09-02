# Contributing to wtx

Thank you for your interest in contributing to `wtx`! This guide covers the development setup, project structure, and contribution guidelines.

## Development Setup

`wtx` is built with TypeScript and uses the [Bun](https://bun.sh) runtime.

1. **Clone the repository**
2. **Install dependencies**
   ```bash
   bun install
   ```
3. **Run in development**
   ```bash
   bun run dev -- ls
   ```
4. **Run tests**
   ```bash
   bun run test
   ```
5. **Type check**
   ```bash
   bun run typecheck
   ```
6. **Build**
   ```bash
   bun run build
   ```

## Project Structure

- `src/index.ts`: Entry point and CLI setup.
- `src/commands/`: Implementation of CLI subcommands.
- `src/lib/`: Core logic, Git wrappers, and configuration management.
- `src/types.ts`: Zod schemas and TypeScript types.
- `share/wtx.sh`: Shell wrapper for `wtx cd`.
- `skills/`: AI agent skill files.
- `completions/`: Shell tab completions.
- `demo/wtx.gif`: Project demo (owner-maintained).

## Coding Standards

To maintain code quality and consistency, please follow these rules:

- **No `as any` or `@ts-ignore`**: Use proper typing throughout the codebase.
- **No unnecessary comments**: Code should be self-documenting. Only comment complex logic that isn't immediately obvious.
- **Git operations**: All git operations must go through `gitExec()` in `src/lib/git.ts` to support verbose and dry-run modes.
- **Configuration**: All config changes must use `saveConfig()` in `src/lib/config.ts` for atomic writes.
- **Output**: Match the existing log output format (repo headers and step indicators).

## Commit Conventions

We use semantic commits. Your commit message should follow this format:

```
<type>: <description>
```

Types include: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

**IMPORTANT**: NEVER add `Co-authored-by` trailers to any commit. Commits must only show the human author.

## Pull Request Process

1. Create a branch for your changes.
2. Ensure all tests pass (`bun run test`) and the type check is clean (`bun run typecheck`).
3. Open a Pull Request with a clear description of your changes.
4. Ensure your PR follows the template checklist.

Thank you for contributing!
