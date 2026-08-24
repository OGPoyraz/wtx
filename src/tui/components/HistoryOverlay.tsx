import { useEffect, useState } from "react";
import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";
import { readRecentHistory } from "../../lib/history.js";
import type { HistoryEntry } from "../../lib/history.js";

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoryEntryLine({ entry }: { entry: HistoryEntry }) {
  const args = entry.args.join(" ");
  const duration =
    entry.durationMs !== null && entry.durationMs !== undefined ? ` ${entry.durationMs}ms` : "";
  const prefix = `${formatShortTime(entry.ts)}  ${entry.source.padEnd(8)}  ${args}`;

  if (entry.exit === null || entry.exit === undefined) {
    return (
      <text>
        <span fg={tokens.dim}>◌ {prefix}</span>
        {duration && <span fg={tokens.dim}>{duration}</span>}
      </text>
    );
  }
  if (entry.exit === 0) {
    return (
      <text>
        <span fg={tokens.success}>✓ {prefix}</span>
        {duration && <span fg={tokens.dim}>{duration}</span>}
      </text>
    );
  }
  return (
    <text>
      <span fg={tokens.error}>✗ </span>
      <span>{prefix}</span>
      <span fg={tokens.dim}> (exit {entry.exit}{duration})</span>
    </text>
  );
}

export function HistoryOverlay() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(readRecentHistory(500));
  }, []);

  return (
    <Overlay title="Action History" borderColor={tokens.border} width={110}>
      <box flexGrow={1} flexDirection="column" style={{ minHeight: 30, maxHeight: 46 }}>
        {entries.length === 0 ? (
          <text fg={tokens.dim}>No actions recorded yet.</text>
        ) : (
          <scrollbox flexGrow={1}>
            {entries.map((entry, i) => (
              <HistoryEntryLine key={i} entry={entry} />
            ))}
          </scrollbox>
        )}
      </box>
      <box marginTop={1}>
        <text fg={tokens.dim}>Press any key to close · newest first</text>
      </box>
    </Overlay>
  );
}
