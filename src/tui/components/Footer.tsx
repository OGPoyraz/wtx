import { tokens } from "../theme.js";
import { useTapHandler } from "../hooks/use-tap.js";

interface FooterProps {
  loading: boolean;
  lastRefreshed: string;
  errorCount: number;
  message?: string;
  busyText?: string;
  spinnerFrame?: string;
  filter?: {
    term: string;
    matches: number;
    total: number;
  };
  onHintClick?: (key: string) => void;
  onErrorClick?: () => void;
}

const HINTS: [string, string][] = [
  ["n", "create"],
  ["d", "remove"],
];

function HintItem({ hintKey, label, isFirst, onClick }: { hintKey: string; label: string; isFirst: boolean; onClick?: (key: string) => void }) {
  const tap = useTapHandler(() => onClick?.(hintKey));
  return (
    <box flexDirection="row" {...(onClick ? tap : {})}>
      <text>
        <span fg={tokens.dim}>{isFirst ? "" : " · "}</span>
        <span fg={tokens.dim}>{`${hintKey} ${label}`}</span>
      </text>
    </box>
  );
}

function ErrorBadge({ count, onClick }: { count: number; onClick?: () => void }) {
  const tap = useTapHandler(() => onClick?.());
  return (
    <box {...(onClick ? tap : {})}>
      <text>
        <span fg={tokens.error}>{`${count} error${count !== 1 ? "s" : ""}`}</span>
        <span fg={tokens.dim}> · e view</span>
      </text>
    </box>
  );
}

export function Footer({ loading, lastRefreshed, errorCount, message, busyText, spinnerFrame, filter, onHintClick, onErrorClick }: FooterProps) {
  const frame = spinnerFrame ?? "◌";

  return (
    <box
      id="footer"
      width="100%"
      height={3}
      border={true}
      borderColor={tokens.border}
      flexDirection="row"
      paddingX={1}
      justifyContent="space-between"
      alignItems="center"
    >
      {busyText ? (
        <text fg={tokens.accent}>{`${frame} ${busyText}`}</text>
      ) : (
        <box flexDirection="row" gap={1}>
          {HINTS.map(([key, label], idx) => (
            <HintItem key={key} hintKey={key} label={label} isFirst={idx === 0} onClick={onHintClick} />
          ))}
        </box>
      )}
      
      <box flexDirection="row" gap={2} alignItems="center">
        {message ? (
          <text fg={tokens.warning}>{message}</text>
        ) : null}
        
        {filter ? (
          <text fg="magenta">filter: {filter.term} ({filter.matches}/{filter.total})</text>
        ) : null}

        {errorCount > 0 ? <ErrorBadge count={errorCount} onClick={onErrorClick} /> : null}
        <HintItem hintKey="?" label="help" isFirst={errorCount === 0} onClick={onHintClick} />
        
        <text fg={tokens.dim}>
          {loading ? `${frame} Refreshing…` : `Updated ${lastRefreshed}`}
        </text>
      </box>
    </box>
  );
}
