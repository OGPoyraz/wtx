import { gitExec, getDirtyFiles } from "./git.js";
import fs from "fs";

export interface Ownership {
  mine: boolean;
  author: string | null; // display tag for the other person, e.g. "@alice" or "Jane Doe"
}

export interface ResolveOwnershipInput {
  configUser: string | null;
  mainPath: string;
  branch: string | null | undefined;
  wtPath?: string;
  prAuthorLogin?: string | null;
  verbose?: boolean;
}

export function deriveOwnership(input: {
  hasRemoteRef: boolean;
  configUser: string | null;
  localEmail: string | null;
  remoteAuthorName: string | null;
  remoteAuthorEmail: string | null;
  prAuthorLogin: string | null;
  hasLocalChanges?: boolean;
}): Ownership | null {
  if (input.hasLocalChanges) {
    return { mine: true, author: null };
  }

  if (!input.hasRemoteRef) {
    return { mine: true, author: null };
  }

  if (input.prAuthorLogin) {
    if (input.configUser && input.prAuthorLogin.toLowerCase() === input.configUser.toLowerCase()) {
      return { mine: true, author: null };
    }
    return { mine: false, author: "@" + input.prAuthorLogin };
  }

  if (input.localEmail && input.remoteAuthorEmail) {
    if (input.localEmail.toLowerCase() === input.remoteAuthorEmail.toLowerCase()) {
      return { mine: true, author: null };
    }
  }

  return null;
}

// Best-effort resolution: never throws, degrades to null on any git failure.
export async function resolveOwnership(input: ResolveOwnershipInput): Promise<Ownership | null> {
  if (!input.branch) {
    return null;
  }

  const { mainPath, branch, verbose } = input;

  let hasLocalChanges = false;
  if (input.wtPath && fs.existsSync(input.wtPath)) {
    try {
      const dirtyFiles = await getDirtyFiles(input.wtPath);
      hasLocalChanges = dirtyFiles.length > 0;
    } catch {
      hasLocalChanges = false;
    }
  }
  if (hasLocalChanges) {
    return { mine: true, author: null };
  }

  let hasRemoteRef = false;
  let upstream: string | null = null;
  let localEmail: string | null = null;
  let remoteAuthorName: string | null = null;
  let remoteAuthorEmail: string | null = null;

  try {
    const stdout = await gitExec(["-C", mainPath, "for-each-ref", `refs/heads/${branch}`, "--format=%(refname:short)%09%(upstream:short)"], { verbose });
    const cols = stdout.trim().split("\t");
    if (cols.length === 2 && cols[1]) {
      upstream = cols[1];
      hasRemoteRef = true;
    }
  } catch {
    hasRemoteRef = false;
  }

  if (!hasRemoteRef) {
    try {
      await gitExec(["-C", mainPath, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], { verbose });
      hasRemoteRef = true;
    } catch {
      hasRemoteRef = false;
    }
  }

  if (!hasRemoteRef) {
    return deriveOwnership({
      hasRemoteRef: false,
      configUser: input.configUser,
      localEmail: null,
      remoteAuthorName: null,
      remoteAuthorEmail: null,
      prAuthorLogin: input.prAuthorLogin ?? null,
    });
  }

  try {
    const stdout = await gitExec(["-C", mainPath, "config", "user.email"], { verbose });
    localEmail = stdout.trim() || null;
  } catch {
    localEmail = null;
  }

  try {
    const targetRef = upstream || `refs/remotes/origin/${branch}`;
    const stdout = await gitExec(["-C", mainPath, "log", "-1", "--format=%an%x09%ae", targetRef], { verbose });
    const cols = stdout.trim().split("\t");
    if (cols.length === 2) {
      remoteAuthorName = cols[0] || null;
      remoteAuthorEmail = cols[1] || null;
    } else if (cols.length === 1 && cols[0]) {
      remoteAuthorName = cols[0] || null;
    }
  } catch {
    remoteAuthorName = null;
    remoteAuthorEmail = null;
  }

  return deriveOwnership({
    hasRemoteRef,
    configUser: input.configUser,
    localEmail,
    remoteAuthorName,
    remoteAuthorEmail,
    prAuthorLogin: input.prAuthorLogin ?? null,
  });
}
