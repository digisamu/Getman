import { bridge } from "../lib/bridge";
import { normalizeWorkspace } from "../lib/migrate";
import { snapshot, useWorkspace, type WorkspaceState } from "./workspace";

const SAVE_DELAY_MS = 400;

const PERSISTED_KEYS = [
  "theme",
  "activeEnvironmentId",
  "environments",
  "collections",
  "history",
  "tabs",
  "activeTabId",
  "settings",
  "sidebarWidth",
  "sidebarHidden",
  "splitRatio"
] as const satisfies ReadonlyArray<keyof WorkspaceState>;

export async function hydrateWorkspace() {
  let raw: unknown = null;
  try {
    const text = await bridge.loadWorkspace();
    raw = text ? JSON.parse(text) : null;
  } catch (error) {
    console.error("Could not read the saved workspace; starting fresh.", error);
  }
  useWorkspace.getState().load(normalizeWorkspace(raw));
  startAutosave();
}

function startAutosave() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  const write = () => {
    timer = undefined;
    pending = false;
    void bridge.saveWorkspace(JSON.stringify(snapshot(useWorkspace.getState()))).catch((error) => console.error("Saving the workspace failed", error));
  };

  // Writes are debounced and only triggered when persisted data actually changed.
  useWorkspace.subscribe((state, previous) => {
    if (!PERSISTED_KEYS.some((key) => state[key] !== previous[key])) return;
    pending = true;
    clearTimeout(timer);
    // Serialise when the main thread is idle so saving never interrupts typing on a slow machine.
    timer = setTimeout(() => requestIdleCallback(write, { timeout: 1000 }), SAVE_DELAY_MS);
  });

  window.addEventListener("beforeunload", () => {
    if (!pending) return;
    clearTimeout(timer);
    bridge.saveWorkspaceSync(JSON.stringify(snapshot(useWorkspace.getState())));
  });
}
