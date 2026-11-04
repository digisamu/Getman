import { nanoid } from "nanoid";
import { DEFAULT_SETTINGS, METHODS, createInitialWorkspace, createRequest, createTab } from "./factory";
import { buildUrl } from "./url";
import type { ApiRequest, BodyType, Collection, Environment, HistoryEntry, KeyValueRow, RequestTab, Theme, Workspace } from "../types/api";

// Loads any saved workspace (including the 0.1 Tauri format) and fills in everything that is missing,
// so a partially written or older file can never crash the app.

type Loose = Record<string, any>;

const THEMES: Theme[] = ["system", "postman", "dark", "light", "sydney"];
const BODY_TYPES: BodyType[] = ["none", "json", "raw", "form-data", "urlencoded"];

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const arr = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []);

function rows(value: unknown): KeyValueRow[] {
  return arr(value).map((row) => ({
    id: str(row.id) || nanoid(),
    key: str(row.key),
    value: str(row.value),
    enabled: row.enabled !== false
  }));
}

export function normalizeRequest(raw: Loose): ApiRequest {
  const base = createRequest();
  const method = METHODS.includes(raw.method) ? raw.method : "GET";
  const body: Loose = raw.body ?? {};
  let bodyType: BodyType = BODY_TYPES.includes(body.type) ? body.type : "none";
  // 0.1 defaulted every request to a "{}" JSON body; treat that as no body.
  if (raw.auth === undefined && bodyType === "json" && str(body.content).trim() === "{}") bodyType = "none";

  let url = str(raw.url);
  let queryParams = rows(raw.queryParams);
  // 0.1 kept params outside the URL. Fold them in once so the URL stays the source of truth.
  if (raw.auth === undefined && queryParams.some((row) => row.enabled && row.key) && !url.includes("?")) {
    url = buildUrl(url, queryParams);
  }
  queryParams = queryParams.filter((row) => row.key || row.value);

  const auth: Loose = raw.auth ?? {};
  return {
    id: str(raw.id) || nanoid(),
    name: str(raw.name) || base.name,
    method,
    url,
    headers: rows(raw.headers),
    queryParams,
    body: { type: bodyType, content: str(body.content), fields: rows(body.fields) },
    auth: {
      type: ["none", "bearer", "basic"].includes(auth.type) ? auth.type : "none",
      token: str(auth.token),
      username: str(auth.username),
      password: str(auth.password)
    }
  };
}

function collections(value: unknown): Collection[] {
  return arr(value).map((collection) => ({
    id: str(collection.id) || nanoid(),
    name: str(collection.name) || "Collection",
    folders: arr(collection.folders).map((folder) => ({
      id: str(folder.id) || nanoid(),
      kind: "folder" as const,
      name: str(folder.name) || "Folder",
      requests: arr(folder.requests).map((request) => ({ ...normalizeRequest(request), kind: "request" as const }))
    }))
  }));
}

function environments(value: unknown): Environment[] {
  return arr(value).map((env) => ({ id: str(env.id) || nanoid(), name: str(env.name) || "Environment", variables: rows(env.variables) }));
}

function history(value: unknown): HistoryEntry[] {
  return arr(value)
    .filter((entry) => entry.request)
    .slice(0, 200)
    .map((entry) => ({
      id: str(entry.id) || nanoid(),
      timestamp: str(entry.timestamp) || new Date().toISOString(),
      request: normalizeRequest(entry.request),
      status: typeof entry.status === "number" ? entry.status : null,
      timeMs: typeof entry.timeMs === "number" ? entry.timeMs : null
    }));
}

function tabs(raw: Loose, colls: Collection[]): RequestTab[] {
  const valid = arr(raw.tabs).map((tab) => {
    const source = tab.source && colls.some((c) => c.id === tab.source.collectionId) ? (tab.source as RequestTab["source"]) : null;
    return { id: str(tab.id) || nanoid(), request: normalizeRequest(tab.request ?? {}), source, dirty: Boolean(tab.dirty) };
  });
  if (valid.length) return valid;
  if (raw.activeRequest) return [createTab(normalizeRequest(raw.activeRequest))];
  return [createTab()];
}

export function normalizeWorkspace(input: unknown): Workspace {
  if (!input || typeof input !== "object") return createInitialWorkspace();
  const raw = input as Loose;
  const colls = collections(raw.collections);
  const envs = environments(raw.environments);
  const tabList = tabs(raw, colls);
  const settings: Loose = raw.settings ?? {};

  return {
    version: 2,
    theme: THEMES.includes(raw.theme) ? raw.theme : "postman",
    activeEnvironmentId: envs.some((env) => env.id === raw.activeEnvironmentId) ? raw.activeEnvironmentId : null,
    environments: envs,
    collections: colls,
    history: history(raw.history),
    tabs: tabList,
    activeTabId: tabList.some((tab) => tab.id === raw.activeTabId) ? raw.activeTabId : tabList[0].id,
    settings: {
      timeoutMs: Number.isFinite(settings.timeoutMs) && settings.timeoutMs >= 0 ? settings.timeoutMs : DEFAULT_SETTINGS.timeoutMs,
      verifySsl: settings.verifySsl !== false,
      followRedirects: settings.followRedirects !== false,
      layout: settings.layout === "vertical" ? "vertical" : "horizontal",
      translucency: typeof settings.translucency === "boolean" ? settings.translucency : DEFAULT_SETTINGS.translucency,
      autoUpdate: settings.autoUpdate !== false
    },
    sidebarWidth: Number.isFinite(raw.sidebarWidth) ? Math.min(480, Math.max(200, raw.sidebarWidth)) : 272,
    sidebarHidden: raw.sidebarHidden === true,
    splitRatio: Number.isFinite(raw.splitRatio) ? Math.min(0.8, Math.max(0.2, raw.splitRatio)) : 0.5
  };
}
