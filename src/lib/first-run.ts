import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { ConfigSchema, type Config } from "../types.js";
import { expandTilde } from "./config.js";

export interface WizardIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export type WizardResult = Config;

export async function runFirstRunWizard(io: WizardIO): Promise<WizardResult> {
  const rl = readline.createInterface({ 
    input: io.input, 
    output: io.output, 
    terminal: false 
  });
  
  const write = (msg: string) => io.output.write(msg + "\n");

  write("Welcome to wtx! Let's get you set up.");
  
  // a) scan repos
  const searchDirs = ["~/Repos", "~/code", "~/dev", "~/projects", "~/src", "~/work"].map(expandTilde);
  const foundRepos: { name: string; fullPath: string; syncFiles: string[] }[] = [];
  
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 200);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const repoPath = path.join(dir, entry.name);
        const gitPath = path.join(repoPath, ".git");
        if (fs.existsSync(gitPath)) {
          // find .env files
          const syncFiles: string[] = [];
          try {
            const repoFiles = fs.readdirSync(repoPath);
            for (const f of repoFiles) {
              if (/^\.env/.test(f)) {
                syncFiles.push(f);
              }
            }
          } catch { /* ignore */ }
          foundRepos.push({ name: entry.name, fullPath: repoPath, syncFiles });
        }
      }
    } catch { /* ignore */ }
  }

  const selectedIndices = new Set<number>();
  let skipped = false;

  if (foundRepos.length > 0) {
    while (true) {
      write("\nDiscovered repositories:");
      foundRepos.forEach((repo, idx) => {
        const mark = selectedIndices.has(idx) ? "[x]" : "[ ]";
        write(`  ${mark} ${idx + 1}. ${repo.name} (${repo.fullPath})`);
      });
      
      const ans = (await rl.question("Enter number to toggle, 'a' to toggle all, 's' to skip, or just Enter to confirm: ")).trim().toLowerCase();
      
      if (ans === "") {
        if (selectedIndices.size === 0) {
          write("Please select at least one repository, or type 's' to skip.");
          continue;
        }
        break;
      }
      if (ans === "s") {
        skipped = true;
        break;
      }
      if (ans === "a") {
        if (selectedIndices.size === foundRepos.length) {
          selectedIndices.clear();
        } else {
          foundRepos.forEach((_, i) => selectedIndices.add(i));
        }
        continue;
      }
      const num = parseInt(ans, 10);
      if (!isNaN(num) && num >= 1 && num <= foundRepos.length) {
        const idx = num - 1;
        if (selectedIndices.has(idx)) selectedIndices.delete(idx);
        else selectedIndices.add(idx);
      } else {
        write("Invalid input.");
      }
    }
  } else {
    write("No git repositories found in common locations.");
  }

  let root = (await rl.question("\nRoot path [~/Repos]: ")).trim();
  if (!root) root = "~/Repos";

  let postfix = (await rl.question("Postfix [-wt]: ")).trim();
  if (!postfix) postfix = "-wt";

  let ide = (await rl.question("IDE [cursor]: ")).trim();
  if (!ide) ide = "cursor";

  const user = (await rl.question("GitHub username (optional): ")).trim() || null;

  rl.close();

  const repos: Record<string, any> = {};
  if (!skipped) {
    for (const idx of selectedIndices) {
      const repo = foundRepos[idx];
      if (!repo) continue;
      repos[repo.name] = {
        main_branch: "auto",
        sync_files: repo.syncFiles.length > 0 ? repo.syncFiles : undefined
      };
    }
  }

  const result = {
    version: 1,
    root,
    postfix,
    ide,
    default_main_branch: "main",
    user,
    repos
  };

  return ConfigSchema.parse(result);
}
