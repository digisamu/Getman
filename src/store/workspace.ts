import { nanoid } from "nanoid";
import { create } from "zustand";
import { cloneRequest, createInitialWorkspace, createRequest, createTab } from "../lib/factory";
import { buildUrl, syncRowsFromUrl } from "../lib/url";
import type {
  ApiRequest,
  Collection,
  CollectionFolder,
  Environment,
  HistoryEntry,
  KeyValueRow,
  RequestSource,
  RequestTab,
  Settings,
  Theme,
  Workspace
} from "../types/api";

type RequestPatch = Partial<ApiRequest> | ((request: ApiRequest) => ApiRequest);

type Actions = {
  load: (workspace: Workspace) => void;
  setTheme: (theme: Theme) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setSplitRatio: (ratio: number) => void;

  // Tabs
  setActiveTab: (tabId: string) => void;
  openNewTab: (request?: ApiRequest) => void;
  openRequest: (source: RequestSource) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  updateRequest: (tabId: string, patch: RequestPatch) => void;
  setUrl: (tabId: string, url: string) => void;
  setQueryParams: (tabId: string, rows: KeyValueRow[]) => void;
  saveTab: (tabId: string) => boolean;
  saveTabAs: (tabId: string, collectionId: string, folderId: string, name: string) => void;

  // Collections
  createCollection: (name?: string) => string;
  importCollection: (collection: Collection) => void;
  renameCollection: (collectionId: string, name: string) => void;
  deleteCollection: (collectionId: string) => void;
  addFolder: (collectionId: string, name?: string) => string;
  renameFolder: (collectionId: string, folderId: string, name: string) => void;
  deleteFolder: (collectionId: string, folderId: string) => void;
  createRequestIn: (collectionId: string, folderId: string) => RequestSource;
  renameRequest: (source: RequestSource, name: string) => void;
  duplicateRequest: (source: RequestSource) => void;
  deleteRequest: (source: RequestSource) => void;

  // Environments
  setActiveEnvironment: (environmentId: string | null) => void;
  addEnvironment: (name?: string) => string;
  renameEnvironment: (environmentId: string, name: string) => void;
  duplicateEnvironment: (environmentId: string) => string;
  deleteEnvironment: (environmentId: string) => void;
  setEnvironmentVariables: (environmentId: string, variables: KeyValueRow[]) => void;

  // History
  addHistory: (request: ApiRequest, status: number | null, timeMs: number | null) => void;
  deleteHistoryEntry: (entryId: string) => void;
  clearHistory: () => void;
};

export type WorkspaceState = Workspace & { hydrated: boolean } & Actions;

const HISTORY_LIMIT = 200;

function mapTab(tabs: RequestTab[], tabId: string, fn: (tab: RequestTab) => RequestTab) {
  return tabs.map((tab) => (tab.id === tabId ? fn(tab) : tab));
}

function mapFolder(collections: Collection[], collectionId: string, folderId: string, fn: (folder: CollectionFolder) => CollectionFolder) {
  return collections.map((collection) =>
    collection.id !== collectionId ? collection : { ...collection, folders: collection.folders.map((folder) => (folder.id === folderId ? fn(folder) : folder)) }
  );
}

export function findRequest(collections: Collection[], source: RequestSource) {
  return collections
    .find((collection) => collection.id === source.collectionId)
    ?.folders.find((folder) => folder.id === source.folderId)
    ?.requests.find((request) => request.id === source.requestId);
}

/** Tabs whose saved request disappeared keep their content but become unsaved drafts. */
function detachTabs(tabs: RequestTab[], matches: (source: RequestSource) => boolean) {
  return tabs.map((tab) => (tab.source && matches(tab.source) ? { ...tab, source: null, dirty: true } : tab));
}

function isPristine(tab: RequestTab | undefined) {
  return Boolean(tab && !tab.source && !tab.dirty && !tab.request.url);
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  ...createInitialWorkspace(),
  hydrated: false,

  load: (workspace) => set({ ...workspace, hydrated: true }),
  setTheme: (theme) => set({ theme }),
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: Math.round(Math.min(480, Math.max(200, sidebarWidth))) }),
  toggleSidebar: () => set((state) => ({ sidebarHidden: !state.sidebarHidden })),
  setSplitRatio: (splitRatio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, splitRatio)) }),

  setActiveTab: (activeTabId) => set({ activeTabId }),

  openNewTab: (request) =>
    set((state) => {
      const tab = createTab(request ?? createRequest());
      const index = state.tabs.findIndex((item) => item.id === state.activeTabId);
      const tabs = [...state.tabs];
      tabs.splice(index + 1, 0, request ? { ...tab, dirty: true } : tab);
      return { tabs, activeTabId: tab.id };
    }),

  openRequest: (source) =>
    set((state) => {
      const open = state.tabs.find((tab) => tab.source?.requestId === source.requestId);
      if (open) return { activeTabId: open.id };
      const saved = findRequest(state.collections, source);
      if (!saved) return {};
      const { kind: _kind, ...request } = saved;
      const tab = createTab(request, source);
      const active = state.tabs.find((item) => item.id === state.activeTabId);
      if (isPristine(active)) {
        return { tabs: state.tabs.map((item) => (item.id === active!.id ? tab : item)), activeTabId: tab.id };
      }
      const index = state.tabs.findIndex((item) => item.id === state.activeTabId);
      const tabs = [...state.tabs];
      tabs.splice(index + 1, 0, tab);
      return { tabs, activeTabId: tab.id };
    }),

  closeTab: (tabId) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return {};
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      if (tabs.length === 0) {
        const tab = createTab();
        return { tabs: [tab], activeTabId: tab.id };
      }
      const activeTabId = state.activeTabId === tabId ? tabs[Math.min(index, tabs.length - 1)].id : state.activeTabId;
      return { tabs, activeTabId };
    }),

  closeOtherTabs: (tabId) => set((state) => ({ tabs: state.tabs.filter((tab) => tab.id === tabId), activeTabId: tabId })),

  updateRequest: (tabId, patch) =>
    set((state) => ({
      tabs: mapTab(state.tabs, tabId, (tab) => ({
        ...tab,
        dirty: true,
        request: typeof patch === "function" ? patch(tab.request) : { ...tab.request, ...patch }
      }))
    })),

  setUrl: (tabId, url) => get().updateRequest(tabId, (request) => ({ ...request, url, queryParams: syncRowsFromUrl(url, request.queryParams) })),

  setQueryParams: (tabId, rows) => get().updateRequest(tabId, (request) => ({ ...request, queryParams: rows, url: buildUrl(request.url, rows) })),

  saveTab: (tabId) => {
    const state = get();
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab?.source || !findRequest(state.collections, tab.source)) return false;
    const { collectionId, folderId, requestId } = tab.source;
    set({
      collections: mapFolder(state.collections, collectionId, folderId, (folder) => ({
        ...folder,
        requests: folder.requests.map((request) => (request.id === requestId ? { ...tab.request, id: requestId, kind: "request" } : request))
      })),
      tabs: mapTab(state.tabs, tabId, (item) => ({ ...item, dirty: false }))
    });
    return true;
  },

  saveTabAs: (tabId, collectionId, folderId, name) =>
    set((state) => {
      const tab = state.tabs.find((item) => item.id === tabId);
      if (!tab) return {};
      const request = cloneRequest(tab.request, { name: name.trim() || tab.request.name });
      return {
        collections: mapFolder(state.collections, collectionId, folderId, (folder) => ({ ...folder, requests: [...folder.requests, { ...request, kind: "request" }] })),
        tabs: mapTab(state.tabs, tabId, (item) => ({ ...item, request, source: { collectionId, folderId, requestId: request.id }, dirty: false }))
      };
    }),

  createCollection: (name = "New collection") => {
    const id = nanoid();
    set((state) => ({ collections: [...state.collections, { id, name, folders: [{ id: nanoid(), kind: "folder", name: "Requests", requests: [] }] }] }));
    return id;
  },

  importCollection: (collection) => set((state) => ({ collections: [...state.collections, collection] })),

  renameCollection: (collectionId, name) =>
    set((state) => ({ collections: state.collections.map((collection) => (collection.id === collectionId ? { ...collection, name } : collection)) })),

  deleteCollection: (collectionId) =>
    set((state) => ({
      collections: state.collections.filter((collection) => collection.id !== collectionId),
      tabs: detachTabs(state.tabs, (source) => source.collectionId === collectionId)
    })),

  addFolder: (collectionId, name = "New folder") => {
    const id = nanoid();
    set((state) => ({
      collections: state.collections.map((collection) =>
        collection.id === collectionId ? { ...collection, folders: [...collection.folders, { id, kind: "folder", name, requests: [] }] } : collection
      )
    }));
    return id;
  },

  renameFolder: (collectionId, folderId, name) =>
    set((state) => ({ collections: mapFolder(state.collections, collectionId, folderId, (folder) => ({ ...folder, name })) })),

  deleteFolder: (collectionId, folderId) =>
    set((state) => ({
      collections: state.collections.map((collection) =>
        collection.id === collectionId ? { ...collection, folders: collection.folders.filter((folder) => folder.id !== folderId) } : collection
      ),
      tabs: detachTabs(state.tabs, (source) => source.folderId === folderId)
    })),

  createRequestIn: (collectionId, folderId) => {
    const request = createRequest({ name: "New request" });
    set((state) => ({ collections: mapFolder(state.collections, collectionId, folderId, (folder) => ({ ...folder, requests: [...folder.requests, { ...request, kind: "request" }] })) }));
    return { collectionId, folderId, requestId: request.id };
  },

  renameRequest: (source, name) =>
    set((state) => ({
      collections: mapFolder(state.collections, source.collectionId, source.folderId, (folder) => ({
        ...folder,
        requests: folder.requests.map((request) => (request.id === source.requestId ? { ...request, name } : request))
      })),
      tabs: state.tabs.map((tab) => (tab.source?.requestId === source.requestId ? { ...tab, request: { ...tab.request, name } } : tab))
    })),

  duplicateRequest: (source) =>
    set((state) => ({
      collections: mapFolder(state.collections, source.collectionId, source.folderId, (folder) => {
        const index = folder.requests.findIndex((request) => request.id === source.requestId);
        if (index < 0) return folder;
        const original = folder.requests[index];
        const requests = [...folder.requests];
        requests.splice(index + 1, 0, { ...cloneRequest(original, { name: `${original.name} copy` }), kind: "request" });
        return { ...folder, requests };
      })
    })),

  deleteRequest: (source) =>
    set((state) => ({
      collections: mapFolder(state.collections, source.collectionId, source.folderId, (folder) => ({
        ...folder,
        requests: folder.requests.filter((request) => request.id !== source.requestId)
      })),
      tabs: detachTabs(state.tabs, (item) => item.requestId === source.requestId)
    })),

  setActiveEnvironment: (activeEnvironmentId) => set({ activeEnvironmentId }),

  addEnvironment: (name = "New environment") => {
    const environment: Environment = { id: nanoid(), name, variables: [] };
    set((state) => ({ environments: [...state.environments, environment] }));
    return environment.id;
  },

  renameEnvironment: (environmentId, name) =>
    set((state) => ({ environments: state.environments.map((env) => (env.id === environmentId ? { ...env, name } : env)) })),

  duplicateEnvironment: (environmentId) => {
    const id = nanoid();
    set((state) => {
      const original = state.environments.find((env) => env.id === environmentId);
      if (!original) return {};
      const copy: Environment = { id, name: `${original.name} copy`, variables: original.variables.map((row) => ({ ...row, id: nanoid() })) };
      return { environments: [...state.environments, copy] };
    });
    return id;
  },

  deleteEnvironment: (environmentId) =>
    set((state) => ({
      environments: state.environments.filter((env) => env.id !== environmentId),
      activeEnvironmentId: state.activeEnvironmentId === environmentId ? null : state.activeEnvironmentId
    })),

  setEnvironmentVariables: (environmentId, variables) =>
    set((state) => ({ environments: state.environments.map((env) => (env.id === environmentId ? { ...env, variables } : env)) })),

  addHistory: (request, status, timeMs) =>
    set((state) => {
      const entry: HistoryEntry = { id: nanoid(), timestamp: new Date().toISOString(), request: cloneRequest(request), status, timeMs };
      return { history: [entry, ...state.history].slice(0, HISTORY_LIMIT) };
    }),

  deleteHistoryEntry: (entryId) => set((state) => ({ history: state.history.filter((entry) => entry.id !== entryId) })),

  clearHistory: () => set({ history: [] })
}));

/** The persisted part of the store, in a stable order. */
export function snapshot(state: WorkspaceState): Workspace {
  return {
    version: 2,
    theme: state.theme,
    activeEnvironmentId: state.activeEnvironmentId,
    environments: state.environments,
    collections: state.collections,
    history: state.history,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    settings: state.settings,
    sidebarWidth: state.sidebarWidth,
    sidebarHidden: state.sidebarHidden,
    splitRatio: state.splitRatio
  };
}

export const useActiveTab = () => useWorkspace((state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0]);

export const useActiveEnvironment = () =>
  useWorkspace((state) => state.environments.find((env) => env.id === state.activeEnvironmentId) ?? null);
