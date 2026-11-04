// Types shared by the Electron main process, the preload bridge and the renderer.

export type HttpRequestBody =
  | { kind: "text"; text: string }
  | { kind: "multipart"; fields: Array<[string, string]> };

export type HttpRequestPayload = {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: HttpRequestBody;
  timeoutMs: number;
  verifySsl: boolean;
  followRedirects: boolean;
};

export type HttpResponsePayload =
  | {
      ok: true;
      status: number;
      statusText: string;
      url: string;
      headers: Array<[string, string]>;
      cookies: string[];
      contentType: string;
      timeMs: number;
      sizeBytes: number;
      bodyText: string | null;
      bodyBase64: string | null;
      /** True when the body was larger than the in-memory preview; the full body is in bodyFile. */
      truncated: boolean;
      bodyFile: string | null;
    }
  | {
      ok: false;
      error: string;
      cancelled?: boolean;
      timeMs: number;
    };

export type SaveFileOptions = {
  defaultName: string;
  content: string;
  encoding?: "utf8" | "base64";
  /** Copy this response temp file instead of writing `content`. */
  sourcePath?: string | null;
};

export type OpenFileOptions = {
  extensions: string[];
};

export type MenuCommand = "new-tab" | "close-tab" | "save" | "save-as" | "import" | "settings" | "toggle-sidebar";

export type AppearanceRequest = {
  /** Which system appearance native UI (menus, dialogs, the glass material) should use. */
  mode: "system" | "light" | "dark";
  translucency: boolean;
  /** Opaque window colour, used behind the window and for the Windows caption buttons. */
  background: string;
  symbols: string;
};

export type AppearanceState = {
  /** Whether glass is actually on: requested, supported by the OS, and not disabled by "Reduce transparency". */
  translucent: boolean;
  supported: boolean;
  reducedTransparency: boolean;
  /** The system accent colour as #rrggbb, when the OS provides one. */
  accent: string | null;
};

export type GetmanBridge = {
  platform: string;
  loadWorkspace: () => Promise<string | null>;
  saveWorkspace: (data: string) => Promise<void>;
  saveWorkspaceSync: (data: string) => void;
  sendRequest: (id: string, payload: HttpRequestPayload) => Promise<HttpResponsePayload>;
  cancelRequest: (id: string) => void;
  saveFile: (options: SaveFileOptions) => Promise<boolean>;
  openFile: (options: OpenFileOptions) => Promise<string | null>;
  /** Appearance the main process applied before the first paint, so the window never flashes. */
  initialAppearance: AppearanceState | null;
  setAppearance: (request: AppearanceRequest) => Promise<AppearanceState>;
  onAppearanceChanged: (listener: () => void) => () => void;
  onMenuCommand: (listener: (command: MenuCommand) => void) => () => void;
};
