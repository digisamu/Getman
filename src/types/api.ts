export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type BodyType = "none" | "json" | "raw" | "form-data" | "urlencoded";

export type AuthType = "none" | "bearer" | "basic";

export type Theme = "postman" | "dark" | "light" | "sydney";

export type KeyValueRow = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

export type RequestBody = {
  type: BodyType;
  content: string;
  fields: KeyValueRow[];
};

export type RequestAuth = {
  type: AuthType;
  token: string;
  username: string;
  password: string;
};

export type ApiRequest = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValueRow[];
  /** Kept in sync with the query string of `url`; disabled rows exist only here. */
  queryParams: KeyValueRow[];
  body: RequestBody;
  auth: RequestAuth;
};

export type CollectionRequest = ApiRequest & {
  kind: "request";
};

export type CollectionFolder = {
  id: string;
  kind: "folder";
  name: string;
  requests: CollectionRequest[];
};

export type Collection = {
  id: string;
  name: string;
  folders: CollectionFolder[];
};

export type HistoryEntry = {
  id: string;
  timestamp: string;
  request: ApiRequest;
  status: number | null;
  timeMs: number | null;
};

export type Environment = {
  id: string;
  name: string;
  variables: KeyValueRow[];
};

export type RequestSource = {
  collectionId: string;
  folderId: string;
  requestId: string;
};

export type RequestTab = {
  id: string;
  request: ApiRequest;
  source: RequestSource | null;
  dirty: boolean;
};

export type Settings = {
  timeoutMs: number;
  verifySsl: boolean;
  followRedirects: boolean;
  layout: "horizontal" | "vertical";
};

export type Workspace = {
  version: 2;
  theme: Theme;
  activeEnvironmentId: string | null;
  environments: Environment[];
  collections: Collection[];
  history: HistoryEntry[];
  tabs: RequestTab[];
  activeTabId: string;
  settings: Settings;
  sidebarWidth: number;
  splitRatio: number;
};

export type ResponseRecord = {
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
  truncated: boolean;
  bodyFile: string | null;
};
