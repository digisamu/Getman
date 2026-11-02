import { nanoid } from "nanoid";
import { create } from "zustand";
import { bridge } from "../lib/bridge";
import { prepareRequest, toPayload } from "../lib/request";
import { variableMap } from "../lib/variables";
import type { ResponseRecord } from "../types/api";
import { useWorkspace } from "./workspace";

// Responses live in memory only, keyed by tab, so switching tabs keeps each tab's last response.

export type ResponseState =
  | { status: "loading"; requestId: string; startedAt: number }
  | { status: "done"; response: ResponseRecord }
  | { status: "error"; error: string; timeMs: number };

type ResponseStore = {
  byTab: Record<string, ResponseState | undefined>;
  setState: (tabId: string, state: ResponseState | undefined) => void;
};

export const useResponses = create<ResponseStore>()((set) => ({
  byTab: {},
  setState: (tabId, state) => set((store) => ({ byTab: { ...store.byTab, [tabId]: state } }))
}));

// Response bodies kept across all tabs. Older responses in background tabs are dropped beyond this,
// so leaving many tabs open with large responses cannot push an 8 GB machine into swap.
const RETAINED_BODY_BYTES = 64 * 1024 * 1024;
const receivedOrder: string[] = [];

function bodyBytes(state: ResponseState | undefined) {
  if (state?.status !== "done") return 0;
  // JavaScript strings are UTF-16, so text costs two bytes per character.
  return (state.response.bodyText?.length ?? 0) * 2 + (state.response.bodyBase64?.length ?? 0) * 2;
}

function trimRetained(keepTabId: string) {
  const index = receivedOrder.indexOf(keepTabId);
  if (index >= 0) receivedOrder.splice(index, 1);
  receivedOrder.push(keepTabId);
  const { byTab, setState } = useResponses.getState();
  let total = receivedOrder.reduce((sum, tabId) => sum + bodyBytes(byTab[tabId]), 0);
  const visible = useWorkspace.getState().activeTabId;
  for (let i = 0; total > RETAINED_BODY_BYTES && i < receivedOrder.length; ) {
    const tabId = receivedOrder[i];
    if (tabId === keepTabId || tabId === visible) {
      i++;
      continue;
    }
    receivedOrder.splice(i, 1);
    total -= bodyBytes(byTab[tabId]);
    setState(tabId, undefined);
  }
}

export const useTabResponse = (tabId: string) => useResponses((store) => store.byTab[tabId]);

export async function sendTab(tabId: string) {
  const workspace = useWorkspace.getState();
  const tab = workspace.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const responses = useResponses.getState();
  const current = responses.byTab[tabId];
  if (current?.status === "loading") return;

  const environment = workspace.environments.find((env) => env.id === workspace.activeEnvironmentId);
  let payload;
  try {
    payload = toPayload(prepareRequest(tab.request, variableMap(environment)), workspace.settings);
  } catch (error) {
    responses.setState(tabId, { status: "error", error: error instanceof Error ? error.message : String(error), timeMs: 0 });
    return;
  }

  const requestId = nanoid();
  responses.setState(tabId, { status: "loading", requestId, startedAt: performance.now() });
  const result = await bridge.sendRequest(requestId, payload);

  // Ignore results for a request that was cancelled or replaced while in flight.
  const latest = useResponses.getState().byTab[tabId];
  if (latest?.status !== "loading" || latest.requestId !== requestId) return;

  if (result.ok) {
    const { ok: _ok, ...response } = result;
    useResponses.getState().setState(tabId, { status: "done", response });
    trimRetained(tabId);
    useWorkspace.getState().addHistory(tab.request, response.status, response.timeMs);
  } else if (result.cancelled) {
    useResponses.getState().setState(tabId, undefined);
  } else {
    useResponses.getState().setState(tabId, { status: "error", error: result.error, timeMs: result.timeMs });
    useWorkspace.getState().addHistory(tab.request, null, null);
  }
}

export function cancelTab(tabId: string) {
  const state = useResponses.getState().byTab[tabId];
  if (state?.status !== "loading") return;
  bridge.cancelRequest(state.requestId);
  useResponses.getState().setState(tabId, undefined);
}
