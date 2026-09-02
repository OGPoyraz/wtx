import type { ReactNode } from "react";
import { useTheme } from "../theme.js";

export interface OverlayProps {
  title?: string;
  borderColor?: string;
  width?: number;
  children: ReactNode;
}

export function Overlay({ title, borderColor, width = 64, children }: OverlayProps) {
  const theme = useTheme();
  const resolvedBorder = borderColor ?? theme.border;
  return (
    <box
      id="overlay-scrim"
      position="absolute"
      width="100%"
      height="100%"
      top={0}
      left={0}
      backgroundColor={theme.scrim}
      zIndex={100}
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
    >
      <box
        id="overlay-panel"
        width={width}
        border={true}
        borderColor={resolvedBorder}
        title={title}
        titleColor={resolvedBorder}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        backgroundColor={theme.panelBg}
      >
        {children}
      </box>
    </box>
  );
}
