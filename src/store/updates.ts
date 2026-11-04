import { create } from "zustand";
import { bridge, isDesktop } from "../lib/bridge";
import type { UpdateInfo, UpdateProgress } from "../shared/ipc";
import { useUi } from "./ui";
import { useWorkspace } from "./workspace";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current"; info: UpdateInfo }
  | { status: "available"; info: UpdateInfo }
  | { status: "installing"; info: UpdateInfo; progress: UpdateProgress | null }
  | { status: "error"; error: string; info: UpdateInfo | null };

export const useUpdates = create<{ state: UpdateState }>()(() => ({ state: { status: "idle" } }));

const setState = (state: UpdateState) => useUpdates.setState({ state });

export async function checkForUpdates({ quiet = false } = {}) {
  const current = useUpdates.getState().state;
  if (current.status === "checking" || current.status === "installing") return;
  setState({ status: "checking" });
  const result = await bridge.checkForUpdates();
  if (!result.ok) {
    // Background checks fail silently (offline, rate limits); a check the user asked for reports why.
    setState(quiet ? { status: "idle" } : { status: "error", error: result.error, info: null });
    return;
  }
  const { info } = result;
  setState(info.available ? { status: "available", info } : { status: "current", info });
  if (info.available && quiet) useUi.getState().toast(`Getman ${info.latest} is available. Update it in Settings.`);
}

export async function installUpdate() {
  const current = useUpdates.getState().state;
  if (current.status !== "available" && !(current.status === "error" && current.info)) return;
  const info = current.info!;
  if (!info.canInstall) {
    window.open(info.url, "_blank");
    return;
  }
  setState({ status: "installing", info, progress: null });
  const unsubscribe = bridge.onUpdateProgress((progress) => setState({ status: "installing", info, progress }));
  const result = await bridge.installUpdate();
  unsubscribe();
  // On success the app quits and the new version starts; we only get here to report a failure.
  if (!result.ok) setState({ status: "error", error: result.error, info });
}

/** Checks quietly a few seconds after launch, once the app is idle, if the user has not turned it off. */
export function scheduleUpdateCheck() {
  if (!isDesktop) return;
  setTimeout(() => {
    if (!useWorkspace.getState().settings.autoUpdate) return;
    requestIdleCallback(() => void checkForUpdates({ quiet: true }), { timeout: 5000 });
  }, 8000);
}
