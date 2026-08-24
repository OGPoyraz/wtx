import { tokens } from "../theme.js";

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
}

export function Footer({ loading, lastRefreshed, errorCount, message, busyText, spinnerFrame, filter }: FooterProps) {
  const hints = "c config · r refresh · f fetch · n create · b rebase · s sync · o IDE · d rm · H hist · ? help";
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
        <text fg={tokens.dim}>{hints}</text>
      )}
      
      <box flexDirection="row" gap={2}>
        {message ? (
          <text fg={tokens.warning}>{message}</text>
        ) : null}
        
        {filter ? (
          <text fg="magenta">filter: {filter.term} ({filter.matches}/{filter.total})</text>
        ) : null}

        {errorCount > 0 ? (
          <text fg={tokens.error}>{errorCount} error{errorCount !== 1 ? 's' : ''}</text>
        ) : null}
        
        <text fg={tokens.dim}>
          {loading ? `${frame} Refreshing…` : `Updated ${lastRefreshed}`}
        </text>
      </box>
    </box>
  );
}
