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

export type MenuCommand = "new-tab" | "close-tab" | "save" | "save-as" | "import" | "settings";

export type GetmanBridge = {
  platform: string;
  loadWorkspace: () => Promise<string | null>;
  saveWorkspace: (data: string) => Promise<void>;
  saveWorkspaceSync: (data: string) => void;
  sendRequest: (id: string, payload: HttpRequestPayload) => Promise<HttpResponsePayload>;
  cancelRequest: (id: string) => void;
  saveFile: (options: SaveFileOptions) => Promise<boolean>;
  openFile: (options: OpenFileOptions) => Promise<string | null>;
  setTitleBarColors: (background: string, symbols: string) => void;
  onMenuCommand: (listener: (command: MenuCommand) => void) => () => void;
};
