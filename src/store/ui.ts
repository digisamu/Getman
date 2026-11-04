import { nanoid } from "nanoid";
import { create } from "zustand";
import type { AppearanceState } from "../shared/ipc";

export type Dialog =
  | { kind: "save"; tabId: string; closeAfter?: boolean }
  | { kind: "environments"; environmentId?: string }
  | { kind: "settings" }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

type Toast = { id: string; message: string; tone: "neutral" | "danger" };

type UiStore = {
  dialog: Dialog | null;
  toolsOpen: boolean;
  sidebarView: "collections" | "history";
  toasts: Toast[];
  appearance: AppearanceState | null;
  setAppearance: (appearance: AppearanceState | null) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  setToolsOpen: (open: boolean) => void;
  setSidebarView: (view: UiStore["sidebarView"]) => void;
  toast: (message: string, tone?: Toast["tone"]) => void;
};

export const useUi = create<UiStore>()((set) => ({
  dialog: null,
  toolsOpen: false,
  sidebarView: "collections",
  toasts: [],
  appearance: null,
  setAppearance: (appearance) => set({ appearance }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setToolsOpen: (toolsOpen) => set({ toolsOpen }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  toast: (message, tone = "neutral") => {
    const id = nanoid();
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, tone }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), 2400);
  }
}));

export function confirmAction(options: Omit<Extract<Dialog, { kind: "confirm" }>, "kind">) {
  useUi.getState().openDialog({ kind: "confirm", ...options });
}

export async function copyText(text: string, label = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(text);
    useUi.getState().toast(label);
  } catch {
    useUi.getState().toast("Could not access the clipboard", "danger");
  }
}
