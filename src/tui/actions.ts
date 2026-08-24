export interface ActionResult {
  exitCode: number;
}

export function resolveActionLauncher(
  argv: string[],
  args: string[],
  opts: { whichWtx?: string | null; execPath: string }
): { cmd: string; args: string[] } {
  const isCompiledBinary = Boolean(argv[0]?.includes("$bunfs"));
  if (isCompiledBinary) {
    return { cmd: opts.whichWtx || opts.execPath, args };
  }

  const terminalIdx = argv.indexOf("terminal");
  if (terminalIdx > 0) {
    return {
      cmd: argv[0]!,
      args: [...argv.slice(1, terminalIdx), ...args],
    };
  }
  return { cmd: argv[0]!, args };
}

export function getSpawnArgs(args: string[]): { cmd: string; args: string[] } {
  return resolveActionLauncher(process.argv, args, {
    whichWtx: Bun.which("wtx") || null,
    execPath: process.execPath,
  });
}

export async function runWtxAction(
  args: string[],
  onLine: (line: string, stream: "out" | "err") => void
): Promise<ActionResult> {
  const spawnCommand = getSpawnArgs(args);

  const proc = Bun.spawn(
    [spawnCommand.cmd, ...spawnCommand.args],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const decoder = new TextDecoder();
  
  async function readStream(
    stream: ReadableStream,
    type: "out" | "err"
  ) {
    let buffer = "";
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        onLine(line, type);
      }
    }
    // Flush remaining buffer
    buffer += decoder.decode(undefined, { stream: false });
    if (buffer.length > 0) {
      onLine(buffer, type);
    }
  }

  const [exitCode] = await Promise.all([
    proc.exited,
    readStream(proc.stdout, "out"),
    readStream(proc.stderr, "err")
  ]);

  return { exitCode };
}
