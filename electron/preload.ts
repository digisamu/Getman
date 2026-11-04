import { contextBridge, ipcRenderer } from "electron";
import type { AppearanceState, GetmanBridge, MenuCommand } from "../src/shared/ipc";

const APPEARANCE_ARG = "--getman-appearance=";

function initialAppearance(): AppearanceState | null {
  const arg = process.argv.find((item) => item.startsWith(APPEARANCE_ARG));
  try {
    return arg ? (JSON.parse(decodeURIComponent(arg.slice(APPEARANCE_ARG.length))) as AppearanceState) : null;
  } catch {
    return null;
  }
}

const bridge: GetmanBridge = {
  platform: process.platform,
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  saveWorkspace: (data) => ipcRenderer.invoke("workspace:save", data),
  saveWorkspaceSync: (data) => {
    ipcRenderer.sendSync("workspace:save-sync", data);
  },
  sendRequest: (id, payload) => ipcRenderer.invoke("http:send", id, payload),
  cancelRequest: (id) => ipcRenderer.send("http:cancel", id),
  saveFile: (options) => ipcRenderer.invoke("file:save", options),
  openFile: (options) => ipcRenderer.invoke("file:open", options),
  initialAppearance: initialAppearance(),
  setAppearance: (request) => ipcRenderer.invoke("window:appearance", request),
  onAppearanceChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("appearance:changed", handler);
    return () => ipcRenderer.removeListener("appearance:changed", handler);
  },
  onMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => ipcRenderer.removeListener("menu:command", handler);
  }
};

contextBridge.exposeInMainWorld("getman", bridge);
