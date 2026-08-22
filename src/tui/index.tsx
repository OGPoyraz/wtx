
import { createCliRenderer, TextTableRenderable } from "@opentui/core";
import { createRoot, extend } from "@opentui/react";
import type { GlobalOptions } from "../types.js";
import { App } from "./components/App.js";

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "text-table": typeof TextTableRenderable;
  }
}

extend({ "text-table": TextTableRenderable });

export async function runTerminal(opts: GlobalOptions): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  const root = createRoot(renderer);

  try {
    root.render(<App opts={opts} />);
  } catch (err) {
    renderer.destroy();
    console.error("Failed to render TUI:", err);
    process.exit(1);
  }
}

