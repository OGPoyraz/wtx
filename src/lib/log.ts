import chalk from "chalk";

const c = chalk;

let quietMode = false;

export function setQuiet(q: boolean): void {
  quietMode = q;
}

export function repoHeader(name: string): void {
  console.log(`\n  ${c.bold(c.dim(name))}`);
}

export function stepProgress(message: string, detail?: string): void {
  if (quietMode) return;
  const right = detail ? `  → ${detail}` : "";
  console.log(`  ${c.cyan("◌")} ${message}${c.dim(right)}`);
}

export function stepSuccess(message: string, detail?: string): void {
  const right = detail ? `  → ${detail}` : "";
  console.log(`  ${c.green("✓")} ${message}${c.dim(right)}`);
}

export function stepWarning(message: string, detail?: string): void {
  const right = detail ? `  → ${detail}` : "";
  console.log(`  ${c.yellow("⚠")} ${message}${c.dim(right)}`);
}

export function stepError(message: string, detail?: string): void {
  const right = detail ? `  → ${detail}` : "";
  console.log(`  ${c.red("✗")} ${message}${c.dim(right)}`);
}

export function summary(message: string): void {
  console.log(`\n${c.green("✓")} ${message}\n`);
}

export function summaryWarning(message: string): void {
  console.log(`\n${c.yellow("⚠")} ${message}\n`);
}

export function info(message: string): void {
  console.log(message);
}

export function error(message: string): void {
  console.error(`${c.red("error:")} ${message}\n`);
}

export function verbose(message: string, isVerbose: boolean): void {
  if (isVerbose) {
    console.error(`${c.dim(`[verbose] ${message}`)}`);
  }
}

export function indented(message: string): void {
  console.log(`    ${message}`);
}
