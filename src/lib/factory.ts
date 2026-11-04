import { nanoid } from "nanoid";
import type { ApiRequest, Collection, Environment, HttpMethod, KeyValueRow, RequestTab, Settings, Workspace } from "../types/api";

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

// Glass is on by default on macOS. On Windows it is opt-in (Settings), since Mica only exists on Windows 11.
const isMacPlatform = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

export const DEFAULT_SETTINGS: Settings = {
  timeoutMs: 0,
  verifySsl: true,
  followRedirects: true,
  layout: "horizontal",
  translucency: isMacPlatform
};

export function createRow(key = "", value = "", enabled = true): KeyValueRow {
  return { id: nanoid(), key, value, enabled };
}

export function createRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: nanoid(),
    name: "Untitled request",
    method: "GET",
    url: "",
    headers: [createRow("Accept", "application/json")],
    queryParams: [],
    body: { type: "none", content: "", fields: [] },
    auth: { type: "none", token: "", username: "", password: "" },
    ...overrides
  };
}

export function createTab(request: ApiRequest = createRequest(), source: RequestTab["source"] = null): RequestTab {
  return { id: nanoid(), request, source, dirty: false };
}

export function createEnvironment(name: string, variables: Array<[string, string]> = []): Environment {
  return { id: nanoid(), name, variables: variables.map(([key, value]) => createRow(key, value)) };
}

/** Deep-copies a request with fresh ids so the copy never shares rows with the original. */
export function cloneRequest(request: ApiRequest, overrides: Partial<ApiRequest> = {}): ApiRequest {
  const rows = (items: KeyValueRow[]) => items.map((row) => ({ ...row, id: nanoid() }));
  return {
    ...request,
    id: nanoid(),
    headers: rows(request.headers),
    queryParams: rows(request.queryParams),
    body: { ...request.body, fields: rows(request.body.fields) },
    auth: { ...request.auth },
    ...overrides
  };
}

export function createInitialWorkspace(): Workspace {
  const local = createEnvironment("Local", [
    ["BASE_URL", "http://localhost:3000"],
    ["TOKEN", ""]
  ]);
  const demo = createEnvironment("JSONPlaceholder", [["BASE_URL", "https://jsonplaceholder.typicode.com"]]);

  const collection: Collection = {
    id: nanoid(),
    name: "Getting started",
    folders: [
      {
        id: nanoid(),
        kind: "folder",
        name: "Posts",
        requests: [
          { ...createRequest({ name: "List posts", url: "{{BASE_URL}}/posts?_limit=5", queryParams: [createRow("_limit", "5")] }), kind: "request" },
          {
            ...createRequest({
              name: "Create post",
              method: "POST",
              url: "{{BASE_URL}}/posts",
              body: { type: "json", content: '{\n  "title": "Hello from Getman",\n  "body": "Sent offline-first.",\n  "userId": 1\n}', fields: [] }
            }),
            kind: "request"
          }
        ]
      }
    ]
  };

  const tab = createTab();
  return {
    version: 2,
    theme: "system",
    activeEnvironmentId: demo.id,
    environments: [demo, local],
    collections: [collection],
    history: [],
    tabs: [tab],
    activeTabId: tab.id,
    settings: { ...DEFAULT_SETTINGS },
    sidebarWidth: 272,
    sidebarHidden: false,
    splitRatio: 0.5
  };
}
