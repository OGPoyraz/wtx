import type { ReactNode } from "react";
import { tokens } from "../theme.js";

export interface OverlayProps {
  title?: string;
  borderColor?: string;
  width?: number;
  children: ReactNode;
}

export function Overlay({ title, borderColor = tokens.border, width = 64, children }: OverlayProps) {
  return (
    <box
      id="overlay-scrim"
      position="absolute"
      width="100%"
      height="100%"
      top={0}
      left={0}
      backgroundColor={tokens.scrim}
      zIndex={100}
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
    >
      <box
        id="overlay-panel"
        width={width}
        border={true}
        borderColor={borderColor}
        title={title}
        titleColor={borderColor}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        backgroundColor={tokens.panelBg}
      >
        {children}
      </box>
    </box>
  );
}
