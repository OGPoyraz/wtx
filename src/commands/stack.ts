import { Command } from "commander";
import type { GlobalOptions } from "../types.js";
import { loadConfig } from "../lib/config.js";
import { getWorktreeList, validateSafeBranchName } from "../lib/git.js";
import {
  parseRepoFlag,
  resolveMainBranch,
  resolveRepos,
} from "../lib/resolver.js";
import { resolveBaseRemote } from "../lib/remotes.js";
import { buildStackHierarchy, getStackAncestors, getStackChildren, readStackMetadata, type StackEntry, type StackMetadata } from "../lib/stack.js";
import { indented, info, repoHeader, stepError, summary, summaryWarning } from "../lib/log.js";

interface StackOptions {
  repo?: string[];
  json?: boolean;
}

interface StackNode {
  branch: string;
  base: string | null;
  explicit: boolean;
  baseSha: string | null;
  worktree: string | null;
}

interface StackResult {
  repo: string;
  branch: string;
  nodes: StackNode[];
}

function nodeFor(
  branch: string,
  metadata: StackMetadata,
  worktrees: Awaited<ReturnType<typeof getWorktreeList>>
): StackNode {
  const entry: StackEntry | undefined = metadata.branches[branch];
  const worktree = worktrees.find((wt) => wt.branch === branch)?.path ?? null;
  return {
    branch,
    base: entry?.baseRef ?? null,
    explicit: entry?.explicit ?? false,
    baseSha: entry?.baseSha ?? null,
    worktree,
  };
}

function collectDescendants(
  metadata: StackMetadata,
  branch: string,
  worktrees: Awaited<ReturnType<typeof getWorktreeList>>,
  seen: Set<string>
): StackNode[] {
  const nodes: StackNode[] = [];
  for (const child of getStackChildren(metadata, branch)) {
    if (seen.has(child)) continue;
    seen.add(child);
    nodes.push(nodeFor(child, metadata, worktrees));
    nodes.push(...collectDescendants(metadata, child, worktrees, seen));
  }
  return nodes;
}

function renderNode(node: StackNode, prefix: string): void {
  const base = node.base ? `  base ${node.base}` : "  base not recorded";
  const location = node.worktree ? `  ${node.worktree}` : "  no local worktree";
  info(`    ${prefix}${node.branch}`);
  indented(`${" ".repeat(prefix.length)}${base} · ${location}`);
}

export function registerStackCommand(program: Command): void {
  program
    .command("stack <branch>")
    .description("Show the recorded branch stack")
    .option("-r, --repo <repos...>", "Target specific repo(s)")
    .option("--json", "Output machine-readable JSON")
    .action(async (branch: string, options: StackOptions) => {
      const globalOpts = program.opts<GlobalOptions>();
      if (!validateSafeBranchName(branch)) {
        stepError(`Invalid branch name: '${branch}'`);
        process.exit(1);
      }

      const config = loadConfig();
      const repoFilter = parseRepoFlag(options.repo);
      const repos = resolveRepos(config, repoFilter);
      const jsonResults: StackResult[] = [];
      let successCount = 0;

      for (const repo of repos) {
        try {
          const metadata = await readStackMetadata(repo.mainPath, globalOpts);
          const worktrees = await getWorktreeList(repo.mainPath);
          const ancestors = getStackAncestors(metadata, branch);
          const nodes = ancestors.map((item) => nodeFor(item, metadata, worktrees));
          const descendants = collectDescendants(metadata, branch, worktrees, new Set(ancestors));
          const allNodes = [...nodes, ...descendants];
          const displayNodes = buildStackHierarchy(
            allNodes,
            (node) => node.branch,
            (node) => node.base ?? undefined,
            (a, b) => a.branch.localeCompare(b.branch)
          );

          if (options.json) {
            jsonResults.push({ repo: repo.name, branch, nodes: allNodes });
          } else {
            repoHeader(repo.name);
            info(`  Stack for ${branch}`);
            if (allNodes.length === 1 && !metadata.branches[branch]) {
              const mainBranch = await resolveMainBranch(repo, config);
              const defaultRemote = await resolveBaseRemote(repo.mainPath, mainBranch);
              const defaultBase = `${defaultRemote}/${mainBranch}`;
              indented(`No recorded parent; default base is ${defaultBase}`);
            }
            displayNodes.forEach(({ item, prefix }) => renderNode(item, prefix));
          }
          successCount++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (options.json) {
            console.error(JSON.stringify({ repo: repo.name, error: message }));
          } else {
            stepError("Failed to read stack", `${repo.name}: ${message}`);
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify(jsonResults.length === 1 ? jsonResults[0] : jsonResults, null, 2));
      } else if (successCount === 0) {
        summaryWarning("No stacks found");
      } else {
        summary(`Done — ${successCount} repo${successCount > 1 ? "s" : ""} checked`);
      }
    });
}
