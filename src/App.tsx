import { useEffect, useMemo, useRef } from "react";
import { DialogHost } from "./components/Dialogs";
import { RequestHeader, RequestPane } from "./components/RequestPane";
import { ResponsePane } from "./components/ResponsePane";
import { Sidebar, importCollectionFromFile } from "./components/Sidebar";
import { requestCloseTab } from "./components/TabBar";
import { ToolsPanel } from "./components/ToolsPanel";
import { THEME_MODES, Toolbar } from "./components/Toolbar";
import { saveActiveTab } from "./components/UrlBar";
import { Splitter } from "./components/ui/Splitter";
import { bridge, isDesktop } from "./lib/bridge";
import { variableMap } from "./lib/variables";
import { cancelTab, sendTab } from "./store/responses";
import { useUi } from "./store/ui";
import type { AppearanceState, MenuCommand } from "./shared/ipc";
import { useActiveEnvironment, useActiveTab, useWorkspace } from "./store/workspace";

function runCommand(command: MenuCommand) {
  const { activeTabId, openNewTab } = useWorkspace.getState();
  const ui = useUi.getState();
  if (ui.dialog && command !== "settings") return;
  switch (command) {
    case "new-tab":
      return openNewTab();
    case "close-tab":
      return requestCloseTab(activeTabId);
    case "save":
      return saveActiveTab(activeTabId);
    case "save-as":
      return ui.openDialog({ kind: "save", tabId: activeTabId });
    case "import":
      return void importCollectionFromFile();
    case "settings":
      return ui.openDialog({ kind: "settings" });
    case "toggle-sidebar":
      return useWorkspace.getState().toggleSidebar();
  }
}

/** Reflects what the main process applied: glass on or off, and the system accent colour. */
export function applyAppearanceState(state: AppearanceState | null) {
  const root = document.documentElement;
  root.dataset.translucent = String(Boolean(state?.translucent));
  if (state?.accent) root.style.setProperty("--system-accent", state.accent);
  else root.style.removeProperty("--system-accent");
  useUi.getState().setAppearance(state);
}

function useShortcuts() {
  useEffect(() => {
    const unsubscribe = bridge.onMenuCommand(runCommand);
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const { activeTabId, tabs, setActiveTab } = useWorkspace.getState();
      if (useUi.getState().dialog) return;

      if (mod && event.key === "Enter") {
        event.preventDefault();
        void sendTab(activeTabId);
      } else if (event.key === "Escape" && !document.querySelector(".menu")) {
        cancelTab(activeTabId);
      } else if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === activeTabId);
        const next = (index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
        setActiveTab(tabs[next].id);
      } else if (!isDesktop && mod) {
        // In Electron these come from the native menu; in a browser preview handle them here.
        const commands: Record<string, MenuCommand> = { s: event.shiftKey ? "save-as" : "save", o: "import", ",": "settings", b: "toggle-sidebar" };
        const command = commands[event.key.toLowerCase()];
        if (command) {
          event.preventDefault();
          runCommand(command);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

function useAppearance() {
  const theme = useWorkspace((state) => state.theme);
  const translucency = useWorkspace((state) => state.settings.translucency);

  useEffect(() => {
    let current = true;
    const root = document.documentElement;
    root.dataset.theme = theme;
    const apply = async () => {
      const styles = getComputedStyle(root);
      const state = await bridge.setAppearance({
        mode: THEME_MODES[theme],
        translucency,
        background: styles.getPropertyValue("--sidebar").trim(),
        symbols: styles.getPropertyValue("--text-muted").trim()
      });
      if (current) applyAppearanceState(state);
    };
    void apply();
    const unsubscribe = bridge.onAppearanceChanged(() => void apply());
    return () => {
      current = false;
      unsubscribe();
    };
  }, [theme, translucency]);

  // While the window is dragged the native glass is swapped for a solid frame (see main.ts).
  useEffect(() => bridge.onDraggingChanged((dragging) => (document.documentElement.dataset.dragging = String(dragging))), []);
  useEffect(() => bridge.onFullScreenChanged((fullScreen) => (document.documentElement.dataset.fullscreen = String(fullScreen))), []);

  // Native apps quiet their window chrome when another app is in front.
  useEffect(() => {
    const root = document.documentElement;
    const update = () => (root.dataset.focused = String(document.hasFocus()));
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);
}

function Workbench() {
  const tab = useActiveTab();
  const environment = useActiveEnvironment();
  const layout = useWorkspace((state) => state.settings.layout);
  const ratio = useWorkspace((state) => state.splitRatio);
  const container = useRef<HTMLDivElement>(null);
  const variables = useMemo(() => variableMap(environment), [environment]);
  const horizontal = layout === "horizontal";

  const onDrag = (position: number) => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect) return;
    const value = horizontal ? (position - rect.left) / rect.width : (position - rect.top) / rect.height;
    useWorkspace.getState().setSplitRatio(value);
  };

  return (
    <>
      <RequestHeader tab={tab} variables={variables} />
      <div ref={container} className={`flex min-h-0 flex-1 ${horizontal ? "flex-row" : "flex-col"}`}>
        <section className="min-h-0 min-w-0 overflow-hidden" style={{ flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 0 }}>
          <RequestPane key={tab.id} tab={tab} variables={variables} environmentKey={environment?.id ?? "none"} />
        </section>
        <Splitter direction={horizontal ? "horizontal" : "vertical"} onDrag={onDrag} onReset={() => useWorkspace.getState().setSplitRatio(0.5)} />
        <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ResponsePane tabId={tab.id} />
        </section>
      </div>
    </>
  );
}

function Toasts() {
  const toasts = useUi((state) => state.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`hud pop-in ${toast.tone === "danger" ? "hud-danger" : ""}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const sidebarWidth = useWorkspace((state) => state.sidebarWidth);
  const sidebarHidden = useWorkspace((state) => state.sidebarHidden);
  const toolsOpen = useUi((state) => state.toolsOpen);
  useShortcuts();
  useAppearance();

  // The frame (sidebar, toolbar, tools) sits on native glass; the workbench stays opaque for legibility and speed.
  return (
    <div className="flex h-full">
      {!sidebarHidden && (
        <>
          <div className="shrink-0" style={{ width: sidebarWidth }}>
            <Sidebar />
          </div>
          <Splitter direction="horizontal" onDrag={(x) => useWorkspace.getState().setSidebarWidth(x)} onReset={() => useWorkspace.getState().setSidebarWidth(272)} />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col bg-bg">
            <Workbench />
          </main>
          {toolsOpen && <ToolsPanel />}
        </div>
      </div>
      <DialogHost />
      <Toasts />
    </div>
  );
}
