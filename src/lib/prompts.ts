import * as readline from "readline";

export function canProceedDeletion(options: {
  interactive: boolean;
  yesFlag: boolean;
  envYes: boolean;
}): boolean {
  if (options.yesFlag || options.envYes) {
    return true;
  }
  return options.interactive;
}
export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

export interface ConfirmIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export async function confirm(
  message: string,
  io?: ConfirmIO
): Promise<boolean> {
  const rl = readline.createInterface({
    input: io?.input ?? process.stdin,
    output: io?.output ?? process.stdout,
  });

  return new Promise((resolve) => {
    let resolved = false;

    rl.question(`${message} [y/N] `, (answer) => {
      if (resolved) return;
      resolved = true;
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });

    rl.on("close", () => {
      if (!resolved) {
        resolved = true;
        const output = io?.output ?? process.stdout;
        if (output && "write" in output && typeof output.write === "function") {
          output.write("\n");
        }
        resolve(false);
      }
    });
  });
}
