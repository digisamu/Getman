import type { GetmanBridge, HttpRequestPayload, HttpResponsePayload, OpenFileOptions, SaveFileOptions } from "../shared/ipc";

declare global {
  interface Window {
    getman?: GetmanBridge;
  }
}

const STORAGE_KEY = "getman.workspace";

// Fallback used when the renderer runs in a plain browser (`npm run dev:web`).
const browserBridge: GetmanBridge = {
  platform: navigator.userAgent.includes("Mac") ? "darwin" : navigator.userAgent.includes("Win") ? "win32" : "linux",
  loadWorkspace: async () => localStorage.getItem(STORAGE_KEY),
  saveWorkspace: async (data) => localStorage.setItem(STORAGE_KEY, data),
  saveWorkspaceSync: (data) => localStorage.setItem(STORAGE_KEY, data),
  async sendRequest(id: string, payload: HttpRequestPayload): Promise<HttpResponsePayload> {
    try {
      const response = await fetch("/__getman__/send", { method: "POST", body: JSON.stringify({ id, payload }) });
      return (await response.json()) as HttpResponsePayload;
    } catch {
      return { ok: false, error: "The browser preview needs the Vite dev server (npm run dev:web) to send requests.", timeMs: 0 };
    }
  },
  cancelRequest: (id) => void fetch(`/__getman__/cancel?id=${encodeURIComponent(id)}`),
  async saveFile({ defaultName, content, encoding }: SaveFileOptions) {
    const bytes = encoding === "base64" ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0)) : content;
    const url = URL.createObjectURL(new Blob([bytes]));
    const link = Object.assign(document.createElement("a"), { href: url, download: defaultName });
    link.click();
    URL.revokeObjectURL(url);
    return true;
  },
  openFile: ({ extensions }: OpenFileOptions) =>
    new Promise((resolve) => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept: extensions.map((ext) => `.${ext}`).join(",") });
      input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
      input.click();
    }),
  initialAppearance: null,
  setAppearance: async () => ({ translucent: false, supported: false, reducedTransparency: false, accent: null }),
  onAppearanceChanged: () => () => undefined,
  onMenuCommand: () => () => undefined
};

export const bridge: GetmanBridge = window.getman ?? browserBridge;
export const isDesktop = Boolean(window.getman);
export const isMac = bridge.platform === "darwin";
