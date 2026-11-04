// UI text uses system fonts; only the Sydney wordmark needs a bundled face (loaded when that theme is on).
import "@fontsource-variable/bodoni-moda/wght-italic.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App, { applyAppearanceState } from "./App";
import { bridge } from "./lib/bridge";
import { preloadEditor } from "./components/CodeEditor";
import { hydrateWorkspace } from "./store/persistence";
import { useWorkspace } from "./store/workspace";
import "./styles.css";

// Load the workspace before the first render so the UI never flashes default data.
await hydrateWorkspace();
document.documentElement.dataset.theme = useWorkspace.getState().theme;
document.documentElement.dataset.platform = bridge.platform;
applyAppearanceState(bridge.initialAppearance);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Fetch the editor chunk once the first screen is up and the main thread is free.
requestIdleCallback(preloadEditor, { timeout: 2000 });
