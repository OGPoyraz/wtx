

import { tokens } from "../theme.js";

interface FooterProps {
  loading: boolean;
  lastRefreshed: string;
  errorCount: number;
  message?: string;
}

export function Footer({ loading, lastRefreshed, errorCount, message }: FooterProps) {
  const hints = "c config · r refresh · n create · b rebase · d remove · o open · s sync · ? help · q quit";
  
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
      <text fg={tokens.dim}>{hints}</text>
      
      <box flexDirection="row" gap={2}>
        {message ? (
          <text fg={tokens.warning}>{message}</text>
        ) : null}
        
        {errorCount > 0 ? (
          <text fg={tokens.error}>{errorCount} error{errorCount !== 1 ? 's' : ''}</text>
        ) : null}
        
        <text fg={tokens.dim}>
          {loading ? "Refreshing..." : `Updated ${lastRefreshed}`}
        </text>
      </box>
    </box>
  );
}
