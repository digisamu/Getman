import { BrowserWindow, Menu, app, dialog, ipcMain, net, protocol, shell, type MenuItemConstructorOptions } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { HttpRequestPayload, MenuCommand, OpenFileOptions, SaveFileOptions } from "../src/shared/ipc";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isMac = process.platform === "darwin";

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

const THEME_BACKGROUNDS: Record<string, string> = {
  postman: "#1c1c1c",
  dark: "#0e1116",
  light: "#f6f7f9",
  sydney: "#fbf6f4"
};

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

function savedThemeBackground() {
  try {
    const raw = readFileSync(existsSync(workspaceFile()) ? workspaceFile() : legacyWorkspaceFile(), "utf8");
    const theme = /"theme"\s*:\s*"(\w+)"/.exec(raw)?.[1] ?? "postman";
    return THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS.postman;
  } catch {
    return THEME_BACKGROUNDS.postman;
  }
}

function createWindow() {
  const background = savedThemeBackground();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: "Getman",
    backgroundColor: background,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 14, y: 13 },
    titleBarOverlay: isMac ? undefined : { color: background, symbolColor: "#888888", height: 44 },
    icon: isMac ? undefined : path.join(__dirname, isDev ? "../public/app-icon.png" : "../dist/app-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
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

  ipcMain.on("window:titlebar", (_event, background: string, symbols: string) => {
    if (!mainWindow || isMac) return;
    mainWindow.setBackgroundColor(background);
    mainWindow.setTitleBarOverlay?.({ color: background, symbolColor: symbols });
  });
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
