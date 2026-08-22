export interface ActionResult {
  exitCode: number;
}

export function getSpawnArgs(args: string[]): { cmd: string; args: string[] } {
  const terminalIdx = process.argv.indexOf("terminal");
  if (terminalIdx > 0) {
    const base = process.argv.slice(0, terminalIdx);
    return {
      cmd: base[0]!,
      args: [...base.slice(1), ...args],
    };
  }
  return {
    cmd: process.argv[0]!,
    args,
  };
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
