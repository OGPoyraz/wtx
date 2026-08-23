export type BranchTarget =
  | { kind: "create-new" }
  | { kind: "track-remote"; foreign?: boolean }
  | { kind: "use-local" }
  | { kind: "diverged"; localSha: string; remoteSha: string };

export function resolveBranchTarget(input: {
  localExists: boolean;
  localSha?: string | null;
  remoteExists: boolean;
  remoteSha?: string | null;
}): BranchTarget {
  if (input.remoteExists && input.localExists) {
    if (input.localSha && input.remoteSha && input.localSha !== input.remoteSha) {
      return {
        kind: "diverged",
        localSha: input.localSha,
        remoteSha: input.remoteSha,
      };
    }
    return { kind: "track-remote" };
  }

  if (input.remoteExists) {
    return { kind: "track-remote" };
  }

  if (input.localExists) {
    return { kind: "use-local" };
  }

  return { kind: "create-new" };
}
