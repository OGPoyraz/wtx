import { Overlay } from "./Overlay.js";
import { tokens } from "../theme.js";

export interface ActionLogModalProps {
  title: string;
  lines: { text: string; type: "out" | "err" }[];
  done: boolean;
  exitCode: number | null;
}

export function ActionLogModal({ title, lines, done, exitCode }: ActionLogModalProps) {
  return (
    <Overlay title={title} borderColor={tokens.border}>
      <box flexGrow={1} flexDirection="column" style={{ minHeight: 10, maxHeight: 20 }}>
        <scrollbox flexGrow={1} stickyScroll={true}>
          {lines.map((line, i) => (
            <text key={i} fg={line.type === "err" ? tokens.error : tokens.fg}>
              {line.text}
            </text>
          ))}
        </scrollbox>
      </box>
      <box marginTop={1} flexDirection="row" justifyContent="center">
        {!done && <text fg={tokens.warning}>Running...</text>}
        {done && exitCode === 0 && <text fg={tokens.success}>✓ Done (exit 0)</text>}
        {done && exitCode !== 0 && (
          <text>
            <span fg={tokens.error}>✗ Exit {exitCode}</span>
            <span fg={tokens.dim}> - press any key to close</span>
          </text>
        )}
      </box>
    </Overlay>
  );
}
