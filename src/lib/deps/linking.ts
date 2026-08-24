import fs from "fs";
import path from "path";
import { stepProgress, stepSuccess, stepWarning, info } from "../log.js";

export function performSafeLink(wtPath: string, mainPath: string, dryRun: boolean, quiet?: boolean) {
  const wtNm = path.join(wtPath, "node_modules");
  const mainNm = path.join(mainPath, "node_modules");

  if (!fs.existsSync(mainNm)) {
    return;
  }

  let existingLink = false;
  try {
    const stat = fs.lstatSync(wtNm);
    existingLink = stat.isSymbolicLink();
  } catch {}

  if (existingLink) {
    if (!quiet) stepProgress("Removing whole-directory symlink to prepare for safe linking...");
    if (!dryRun) {
      fs.unlinkSync(wtNm);
    }
  }

  if (!dryRun && !fs.existsSync(wtNm)) {
    fs.mkdirSync(wtNm, { recursive: true });
  }

  const entriesToLink: { name: string; target: string; isBin: boolean }[] = [];

  try {
    const mainEntries = fs.readdirSync(mainNm, { withFileTypes: true });
    for (const entry of mainEntries) {
      if (entry.name === ".bin") {
        entriesToLink.push({
          name: ".bin",
          target: path.join(mainNm, ".bin"),
          isBin: true
        });
      } else if (entry.name.startsWith("@") && entry.isDirectory()) {
        const scopePath = path.join(mainNm, entry.name);
        try {
          const scopedEntries = fs.readdirSync(scopePath, { withFileTypes: true });
          for (const scopedEntry of scopedEntries) {
            entriesToLink.push({
              name: path.join(entry.name, scopedEntry.name),
              target: path.join(scopePath, scopedEntry.name),
              isBin: false
            });
          }
        } catch {}
      } else {
        entriesToLink.push({
          name: entry.name,
          target: path.join(mainNm, entry.name),
          isBin: false
        });
      }
    }
  } catch {}

  let createdCount = 0;
  let failedCount = 0;
  const failedNames: string[] = [];
  for (const { name, target, isBin } of entriesToLink) {
    const linkPath = path.join(wtNm, name);
    
    if (dryRun) {
      if (!quiet) info(`  [dry-run] Would link ${name}`);
      createdCount++;
      continue;
    }

    try {
      const parentDir = path.dirname(linkPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      let shouldLink = true;
      let backupPath: string | null = null;
      try {
        const stat = fs.lstatSync(linkPath);
        if (stat.isSymbolicLink()) {
          const existingTarget = fs.readlinkSync(linkPath);
          const resolvedExisting = path.resolve(path.dirname(linkPath), existingTarget);
          if (resolvedExisting === target) {
            shouldLink = false;
          } else {
            fs.unlinkSync(linkPath);
          }
        } else {
          backupPath = `${linkPath}.wtx-old`;
          fs.renameSync(linkPath, backupPath);
        }
      } catch {}

      if (shouldLink) {
        try {
          const relTarget = path.relative(path.dirname(linkPath), target);
          fs.symlinkSync(relTarget, linkPath, isBin ? "dir" : (fs.statSync(target).isDirectory() ? "dir" : "file"));
          createdCount++;
        } catch (err) {
          if (backupPath) {
            fs.renameSync(backupPath, linkPath);
          }
          throw err;
        }
      }

      if (backupPath && fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
      }
    } catch {
      failedCount++;
      failedNames.push(name);
    }
  }

  if (!quiet && createdCount > 0) {
    stepSuccess(`Safely linked ${createdCount} packages from main node_modules`);
  }
  if (!quiet && failedCount > 0) {
    stepWarning(`${failedCount} packages could not be linked`, failedNames.slice(0, 5).join(", ") + (failedNames.length > 5 ? `, +${failedNames.length - 5} more` : ""));
  }
}
