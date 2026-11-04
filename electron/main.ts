import { BrowserWindow, Menu, app, dialog, ipcMain, nativeTheme, net, protocol, shell, systemPreferences, type MenuItemConstructorOptions } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { release, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AppearanceRequest, AppearanceState, HttpRequestPayload, MenuCommand, OpenFileOptions, SaveFileOptions } from "../src/shared/ipc";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
// Mica needs Windows 11 22H2 (build 22621) or newer.
const supportsGlass = isMac || (isWindows && Number(release().split(".")[2] ?? 0) >= 22621);
const TOOLBAR_HEIGHT = 52;

app.setName("Getman");
// Lets development and test runs use a throwaway profile instead of the real workspace.
if (process.env.GETMAN_USER_DATA) app.setPath("userData", process.env.GETMAN_USER_DATA);

// The UI is served from app://getman instead of file:// so Chromium keeps a V8 code cache for it:
// after the first launch the bundle is not re-compiled, which matters most on slow CPUs.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);
const distDir = path.join(__dirname, "../dist");

// The HTTP engine (undici) is only loaded when the first request is sent, keeping startup lean.
let httpEngine: typeof import("./http") | null = null;
const http = () => (httpEngine ??= require("./http.cjs") as typeof import("./http"));

const workspaceFile = () => path.join(app.getPath("userData"), "workspace.json");
// Workspaces written by the old Tauri build live under the bundle identifier.
const legacyWorkspaceFile = () => path.join(app.getPath("appData"), "com.getman.desktop", "workspace.json");

// Opaque window colours per theme, painted before the page loads.
const THEME_BACKGROUNDS: Record<string, { light: string; dark: string }> = {
  system: { light: "#f5f5f7", dark: "#2a2a2c" },
  postman: { light: "#212121", dark: "#212121" },
  dark: { light: "#12161c", dark: "#12161c" },
  light: { light: "#f7f7f8", dark: "#f7f7f8" },
  sydney: { light: "#f8efec", dark: "#f8efec" }
};
const THEME_MODES: Record<string, AppearanceRequest["mode"]> = { system: "system", postman: "dark", dark: "dark", light: "light", sydney: "light" };

let mainWindow: BrowserWindow | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function readWorkspace(): Promise<string | null> {
  const file = workspaceFile();
  if (!existsSync(file) && existsSync(legacyWorkspaceFile())) {
    await mkdir(path.dirname(file), { recursive: true });
    await copyFile(legacyWorkspaceFile(), file);
  }
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

function writeWorkspace(data: string) {
  // Serialise writes and swap the file in atomically so a crash never leaves half a workspace.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const file = workspaceFile();
      const temp = `${file}.tmp`;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(temp, data, "utf8");
      await rename(temp, file);
    });
  return writeQueue;
}

/** Reads just enough of the saved workspace to style the window before the page has loaded. */
function savedAppearance(): AppearanceRequest {
  let raw = "";
  try {
    raw = readFileSync(existsSync(workspaceFile()) ? workspaceFile() : legacyWorkspaceFile(), "utf8");
  } catch {
    // First launch.
  }
  const theme = /"theme"\s*:\s*"(\w+)"/.exec(raw)?.[1] ?? "system";
  const saved = /"translucency"\s*:\s*(true|false)/.exec(raw)?.[1];
  const mode = THEME_MODES[theme] ?? "system";
  nativeTheme.themeSource = mode;
  const colors = THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS.system;
  return {
    mode,
    translucency: saved ? saved === "true" : isMac,
    background: nativeTheme.shouldUseDarkColors ? colors.dark : colors.light,
    symbols: nativeTheme.shouldUseDarkColors ? "#c7c7cc" : "#3c3c43"
  };
}

function accentColor() {
  if (!isMac && !isWindows) return null;
  const value = systemPreferences.getAccentColor();
  return typeof value === "string" && value.length >= 6 ? `#${value.slice(0, 6)}` : null;
}

function appearanceState(request: AppearanceRequest): AppearanceState {
  const reducedTransparency = nativeTheme.prefersReducedTransparency;
  return {
    translucent: request.translucency && supportsGlass && !reducedTransparency,
    supported: supportsGlass,
    reducedTransparency,
    accent: accentColor()
  };
}

function applyAppearance(window: BrowserWindow, request: AppearanceRequest): AppearanceState {
  // Only assign when it changes: every assignment can emit "updated", which would loop back here.
  if (nativeTheme.themeSource !== request.mode) nativeTheme.themeSource = request.mode;
  const state = appearanceState(request);
  // The window server draws the glass, so it costs almost nothing on the GPU, even on low-end laptops.
  if (isMac) window.setVibrancy(state.translucent ? "sidebar" : null);
  if (isWindows && supportsGlass) window.setBackgroundMaterial(state.translucent ? "mica" : "none");
  window.setBackgroundColor(state.translucent ? "#00000000" : request.background);
  if (!isMac) window.setTitleBarOverlay?.({ color: state.translucent ? "#00000000" : request.background, symbolColor: request.symbols, height: TOOLBAR_HEIGHT });
  return state;
}

function createWindow() {
  const appearance = savedAppearance();
  const initial = appearanceState(appearance);
  const background = initial.translucent ? "#00000000" : appearance.background;
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: "Getman",
    backgroundColor: background,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 18, y: 19 },
    titleBarOverlay: isMac ? undefined : { color: background, symbolColor: appearance.symbols, height: TOOLBAR_HEIGHT },
    vibrancy: isMac && initial.translucent ? "sidebar" : undefined,
    visualEffectState: "followWindow",
    backgroundMaterial: isWindows && supportsGlass ? (initial.translucent ? "mica" : "none") : undefined,
    icon: isMac ? undefined : path.join(__dirname, isDev ? "../public/app-icon.png" : "../dist/app-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--getman-appearance=${encodeURIComponent(JSON.stringify(initial))}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Never navigate the app window away; open links in the user's browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void mainWindow.loadURL("app://getman/index.html");
  }
}

function sendMenuCommand(command: MenuCommand) {
  mainWindow?.webContents.send("menu:command", command);
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendMenuCommand("settings") },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const }
            ]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Request", accelerator: "CmdOrCtrl+T", click: () => sendMenuCommand("new-tab") },
        { label: "Save Request", accelerator: "CmdOrCtrl+S", click: () => sendMenuCommand("save") },
        { label: "Save Request As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendMenuCommand("save-as") },
        { type: "separator" },
        { label: "Import Collection…", accelerator: "CmdOrCtrl+O", click: () => sendMenuCommand("import") },
        { type: "separator" },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => sendMenuCommand("close-tab") },
        ...(isMac ? [{ role: "close" as const, accelerator: "CmdOrCtrl+Shift+W" }] : [{ label: "Settings", accelerator: "Ctrl+,", click: () => sendMenuCommand("settings") }, { role: "quit" as const }])
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Toggle Sidebar", accelerator: isMac ? "Ctrl+Cmd+S" : "Ctrl+B", click: () => sendMenuCommand("toggle-sidebar") },
        { type: "separator" },
        { role: "reload" },
        ...(isDev ? [{ role: "toggleDevTools" as const }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ type: "separator" as const }, { role: "front" as const }] : [])] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("workspace:load", () => readWorkspace());
  ipcMain.handle("workspace:save", (_event, data: string) => writeWorkspace(data));
  ipcMain.on("workspace:save-sync", (event, data: string) => {
    writeWorkspace(data).finally(() => {
      event.returnValue = true;
    });
  });

  ipcMain.handle("http:send", (_event, id: string, payload: HttpRequestPayload) => http().executeHttpRequest(id, payload));
  ipcMain.on("http:cancel", (_event, id: string) => httpEngine?.cancelHttpRequest(id));

  ipcMain.handle("file:save", async (_event, options: SaveFileOptions) => {
    if (!mainWindow) return false;
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: options.defaultName });
    if (result.canceled || !result.filePath) return false;
    const source = options.sourcePath ? path.resolve(options.sourcePath) : null;
    if (source && path.dirname(source) === path.resolve(tmpdir()) && path.basename(source).startsWith("getman-response-")) {
      await copyFile(source, result.filePath);
    } else {
      await writeFile(result.filePath, Buffer.from(options.content, options.encoding ?? "utf8"));
    }
    return true;
  });

  ipcMain.handle("file:open", async (_event, options: OpenFileOptions) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Supported files", extensions: options.extensions }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return readFile(result.filePaths[0], "utf8");
  });

  ipcMain.handle("window:appearance", (_event, request: AppearanceRequest) =>
    mainWindow ? applyAppearance(mainWindow, request) : appearanceState(request)
  );

  // Tell the page when the accent colour or "Reduce transparency" changes so it can re-apply its look.
  const notify = () => mainWindow?.webContents.send("appearance:changed");
  nativeTheme.on("updated", notify);
  if (isMac) systemPreferences.subscribeNotification("AppleColorPreferencesChangedNotification", notify);
  if (isWindows) systemPreferences.on("accent-color-changed", notify);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // Packaged builds take the icon from the app bundle; in development replace the stock Electron icon.
    if (isDev && isMac) app.dock?.setIcon(path.join(__dirname, "../build/icon-macos.png"));
    protocol.handle("app", (request) => {
      const file = path.normalize(path.join(distDir, decodeURIComponent(new URL(request.url).pathname)));
      if (!file.startsWith(distDir + path.sep)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    registerIpc();
    buildMenu();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("will-quit", () => httpEngine?.removeResponseFiles());

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
}
