import { describe, expect, it } from "vitest";
import { parseCurl } from "./curl";
import { formatJson, prettyJsonText } from "./format";
import { createRequest, createRow } from "./factory";
import { normalizeWorkspace } from "./migrate";
import { exportCollection, importCollection } from "./postman";
import { prepareRequest } from "./request";
import { generateSnippet } from "./snippets";
import { buildUrl, normalizeUrl, syncRowsFromUrl } from "./url";
import { resolveVariables, variableMap } from "./variables";

const vars = new Map([
  ["BASE_URL", "https://api.example.com"],
  ["TOKEN", "abc"],
  ["ID", "42"]
]);

describe("url", () => {
  it("adds the right scheme", () => {
    expect(normalizeUrl("example.com/api")).toBe("https://example.com/api");
    expect(normalizeUrl("localhost:3000/users")).toBe("http://localhost:3000/users");
    expect(normalizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    expect(normalizeUrl("app.localhost/x")).toBe("http://app.localhost/x");
    expect(normalizeUrl("ftp://host")).toBe("ftp://host");
    expect(() => normalizeUrl("   ")).toThrow();
  });

  it("keeps row ids stable while the URL is typed", () => {
    const rows = syncRowsFromUrl("x.com?a=1&b=2", []);
    const next = syncRowsFromUrl("x.com?a=10&b=2", rows);
    expect(next.map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(next[0].value).toBe("10");
  });

  it("keeps disabled rows and rebuilds the URL from enabled ones", () => {
    const rows = [createRow("a", "1"), createRow("off", "x", false), createRow("b", "{{ID}}")];
    const url = buildUrl("x.com/path?old=1#frag", rows);
    expect(url).toBe("x.com/path?a=1&b={{ID}}#frag");
    const synced = syncRowsFromUrl(url, rows);
    expect(synced.map((row) => row.key)).toEqual(["a", "off", "b"]);
    expect(synced[1].enabled).toBe(false);
  });
});

describe("variables", () => {
  it("resolves known variables and leaves unknown ones visible", () => {
    expect(resolveVariables("{{BASE_URL}}/u/{{ ID }}/{{MISSING}}", vars)).toBe("https://api.example.com/u/42/{{MISSING}}");
  });

  it("ignores disabled environment rows", () => {
    const map = variableMap({ id: "e", name: "E", variables: [createRow("A", "1"), createRow("B", "2", false)] });
    expect([...map.keys()]).toEqual(["A"]);
  });
});

describe("prepareRequest", () => {
  it("sends JSON bodies with unquoted variables and a case-insensitive content type check", () => {
    const request = createRequest({
      method: "POST",
      url: "{{BASE_URL}}/items",
      headers: [createRow("content-type", "application/vnd.api+json")],
      body: { type: "json", content: '{"id": {{ID}}}', fields: [] }
    });
    const prepared = prepareRequest(request, vars);
    expect(prepared.url).toBe("https://api.example.com/items");
    expect(prepared.body).toEqual({ kind: "text", text: '{"id": 42}' });
    expect(prepared.headers.filter(([key]) => key.toLowerCase() === "content-type")).toHaveLength(1);
  });

  it("sends form-data as multipart, not urlencoded", () => {
    const request = createRequest({ method: "POST", url: "x.com", headers: [], body: { type: "form-data", content: "", fields: [createRow("a", "1")] } });
    expect(prepareRequest(request, vars).body).toEqual({ kind: "multipart", fields: [["a", "1"]] });
  });

  it("encodes urlencoded fields and drops bodies for GET", () => {
    const post = createRequest({ method: "POST", url: "x.com", body: { type: "urlencoded", content: "", fields: [createRow("q", "a b&c")] } });
    expect(prepareRequest(post, vars).body).toEqual({ kind: "text", text: "q=a+b%26c" });
    const get = createRequest({ url: "x.com", body: { type: "json", content: "{}", fields: [] } });
    expect(prepareRequest(get, vars).body).toBeUndefined();
  });

  it("applies bearer and basic auth unless an Authorization header exists", () => {
    const bearer = createRequest({ url: "x.com", auth: { type: "bearer", token: "{{TOKEN}}", username: "", password: "" } });
    expect(prepareRequest(bearer, vars).headers).toContainEqual(["Authorization", "Bearer abc"]);
    const basic = createRequest({ url: "x.com", auth: { type: "basic", token: "", username: "ü", password: "p" } });
    expect(prepareRequest(basic, vars).headers).toContainEqual(["Authorization", `Basic ${Buffer.from("ü:p").toString("base64")}`]);
    const manual = createRequest({ url: "x.com", headers: [createRow("authorization", "Custom")], auth: { type: "bearer", token: "t", username: "", password: "" } });
    expect(prepareRequest(manual, vars).headers).toEqual([["authorization", "Custom"]]);
  });

  it("reports invalid URLs clearly", () => {
    expect(() => prepareRequest(createRequest({ url: "http://exa mple.com" }), vars)).toThrow(/not a valid URL/);
  });
});

describe("snippets", () => {
  it("generates each language for the selected request", () => {
    const prepared = prepareRequest(createRequest({ method: "POST", url: "x.com", body: { type: "raw", content: "it's", fields: [] } }), vars);
    expect(generateSnippet("curl", prepared)).toContain("--data-raw 'it'\\''s'");
    expect(generateSnippet("javascript", prepared)).toContain('body: "it\'s"');
    expect(generateSnippet("python", prepared)).toContain("requests.request(\"POST\"");
    expect(generateSnippet("java", prepared)).toContain("BodyPublishers.ofString");
  });
});

describe("parseCurl", () => {
  it("parses method, headers, JSON body and bearer auth", () => {
    const request = parseCurl(`curl -X PUT 'https://api.test/items/1?x=1' \\\n  -H 'Content-Type: application/json' \\\n  -H "Authorization: Bearer tok" \\\n  --data-raw '{"a": "it\\'s"}'`);
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("https://api.test/items/1?x=1");
    expect(request.queryParams.map((row) => row.key)).toEqual(["x"]);
    expect(request.body.type).toBe("json");
    expect(request.auth).toMatchObject({ type: "bearer", token: "tok" });
    expect(request.headers.map((row) => row.key)).toEqual(["Content-Type"]);
  });

  it("defaults to POST with data and handles urlencoded, forms and basic auth", () => {
    const urlencoded = parseCurl("curl https://a.test -d 'a=1&b=2' -u user:pass");
    expect(urlencoded.method).toBe("POST");
    expect(urlencoded.body.type).toBe("urlencoded");
    expect(urlencoded.body.fields.map((row) => [row.key, row.value])).toEqual([["a", "1"], ["b", "2"]]);
    expect(urlencoded.auth).toMatchObject({ type: "basic", username: "user", password: "pass" });
    const form = parseCurl("curl https://a.test -F name=x");
    expect(form.body.type).toBe("form-data");
  });
});

describe("normalizeWorkspace", () => {
  it("migrates a 0.1 workspace", () => {
    const legacy = {
      theme: "sydney",
      activeEnvironmentId: "env1",
      environments: [{ id: "env1", name: "Local", variables: [{ id: "v", key: "BASE_URL", value: "http://localhost", enabled: true }] }],
      collections: [{ id: "c", name: "C", folders: [{ id: "f", kind: "folder", name: "F", requests: [{ id: "r", name: "R", method: "GET", url: "{{BASE_URL}}/u", headers: [], queryParams: [{ id: "q", key: "page", value: "2", enabled: true }], body: { type: "json", content: "{}", fields: [] }, kind: "request" }] }] }],
      history: [],
      activeRequest: { id: "a", name: "Draft", method: "POST", url: "x.com", headers: [], queryParams: [], body: { type: "json", content: '{"a":1}', fields: [] } }
    };
    const workspace = normalizeWorkspace(legacy);
    expect(workspace.theme).toBe("sydney");
    expect(workspace.activeEnvironmentId).toBe("env1");
    const request = workspace.collections[0].folders[0].requests[0];
    expect(request.url).toBe("{{BASE_URL}}/u?page=2");
    expect(request.body.type).toBe("none");
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.tabs[0].request.body).toMatchObject({ type: "json", content: '{"a":1}' });
  });

  it("survives garbage", () => {
    expect(normalizeWorkspace(null).tabs).toHaveLength(1);
    expect(normalizeWorkspace({ collections: "nope", tabs: [{}], settings: { timeoutMs: -5 } }).settings.timeoutMs).toBe(0);
  });
});

describe("postman", () => {
  it("round-trips a collection through the Postman v2.1 format", () => {
    const collection = normalizeWorkspace(null).collections[0];
    const imported = importCollection(exportCollection(collection));
    expect(imported.name).toBe(collection.name);
    const original = collection.folders[0].requests[1];
    const copy = imported.folders[0].requests[1];
    expect(copy).toMatchObject({ name: original.name, method: original.method, url: original.url, body: { type: "json", content: original.body.content } });
  });

  it("flattens nested Postman folders", () => {
    const imported = importCollection(
      JSON.stringify({
        info: { name: "P" },
        item: [{ name: "Root", request: "https://a.test" }, { name: "Users", item: [{ name: "Admin", item: [{ name: "List", request: { method: "GET", url: { raw: "https://a.test/u" } } }] }] }]
      })
    );
    expect(imported.folders.map((folder) => folder.name)).toEqual(["Requests", "Users", "Users / Admin"]);
    expect(imported.folders[2].requests[0].url).toBe("https://a.test/u");
  });

  it("rejects unrelated JSON", () => {
    expect(() => importCollection('{"hello": 1}')).toThrow();
    expect(() => importCollection("not json")).toThrow(/valid JSON/);
  });
});

describe("formatJson", () => {
  it("matches JSON.stringify output for ordinary documents", () => {
    const value = { a: 1, b: [1, 2, { c: "x" }], d: {}, e: [], f: null, g: 'q"uote {[,:]} back\\slash' };
    expect(formatJson(JSON.stringify(value))).toBe(JSON.stringify(value, null, 2));
    expect(formatJson(JSON.stringify(value, null, 4))).toBe(JSON.stringify(value, null, 2));
  });

  it("keeps large integers exactly as sent", () => {
    expect(formatJson('{"id":9007199254740993}')).toBe('{\n  "id": 9007199254740993\n}');
  });

  it("only uses the precision-safe path when it matters", () => {
    expect(prettyJsonText('{"id":9007199254740993}')).toContain("9007199254740993");
    expect(prettyJsonText('{"a":[1,2')).toBe('{\n  "a": [\n    1,\n    2');
    expect(prettyJsonText('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("does not throw on a document cut off midway", () => {
    expect(formatJson('{"a":[1,2,{"b":"tex')).toBe('{\n  "a": [\n    1,\n    2,\n    {\n      "b": "tex');
  });
});
