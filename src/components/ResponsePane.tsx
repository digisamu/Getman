import { AlertTriangle, Copy, Download, WrapText } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { bridge, isMac } from "../lib/bridge";
import { formatBytes, formatDuration, formatJson, looksLikeJson, prettyJsonText, statusTone } from "../lib/format";
import { cancelTab, useTabResponse } from "../store/responses";
import { copyText, useUi } from "../store/ui";
import type { ResponseRecord } from "../types/api";
import { CodeEditor, type EditorLanguage } from "./CodeEditor";

// Above this size Raw view uses a native text area, which handles multi-megabyte lines far better.
const NATIVE_RAW_LIMIT = 1024 * 1024;

function editorLanguage(contentType: string): EditorLanguage {
  const type = contentType.toLowerCase();
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "html";
  if (type.includes("xml")) return "xml";
  if (type.includes("javascript")) return "javascript";
  return "text";
}

function fileExtension(contentType: string) {
  const type = contentType.toLowerCase();
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "html";
  if (type.includes("xml")) return "xml";
  if (type.includes("javascript")) return "js";
  if (type.includes("csv")) return "csv";
  if (type.includes("pdf")) return "pdf";
  const image = /image\/(png|jpe?g|gif|webp|svg|avif)/.exec(type);
  if (image) return image[1] === "svg" ? "svg" : image[1].replace("jpeg", "jpg");
  return type.startsWith("text/") ? "txt" : "bin";
}

// Memoised: the response does not change while the request above it is being edited.
export const ResponsePane = memo(function ResponsePane({ tabId }: { tabId: string }) {
  const state = useTabResponse(tabId);

  if (!state) return <EmptyResponse />;
  if (state.status === "loading") return <LoadingResponse tabId={tabId} startedAt={state.startedAt} />;
  if (state.status === "error") {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger">
            <AlertTriangle size={18} />
          </div>
          <div className="text-base font-semibold">Could not get a response</div>
          <p className="selectable mt-1.5 text-sm text-muted">{state.error}</p>
        </div>
      </div>
    );
  }
  return <ResponseView key={tabId} response={state.response} />;
});

function EmptyResponse() {
  const mod = isMac ? "⌘" : "Ctrl";
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <div className="empty-mark text-base text-muted">Send a request to see the response here.</div>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-faint">
          <span className="kbd">{mod}</span>
          <span className="kbd">Enter</span>
          <span className="ml-1">sends the request</span>
        </div>
      </div>
    </div>
  );
}

function LoadingResponse({ tabId, startedAt }: { tabId: string; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.round(performance.now() - startedAt)), 100);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="relative h-full">
      <div className="progress-bar absolute inset-x-0 top-0 h-0.5" />
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <div className="text-sm text-muted">Sending request…</div>
          <div className="mt-1 font-mono text-xs text-faint">{formatDuration(elapsed)}</div>
          <button className="btn mt-4" onClick={() => cancelTab(tabId)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type View = "body" | "headers" | "cookies";
type BodyMode = "pretty" | "raw" | "preview";

function ResponseView({ response }: { response: ResponseRecord }) {
  const [view, setView] = useState<View>("body");
  const [wrap, setWrap] = useState(false);
  const type = response.contentType.toLowerCase();
  const isImage = type.startsWith("image/") && Boolean(response.bodyBase64);
  const isHtml = type.includes("html") && response.bodyText !== null;
  const [preferredMode, setMode] = useState<BodyMode>("pretty");
  const modes: BodyMode[] = isImage ? ["preview"] : isHtml ? ["pretty", "raw", "preview"] : ["pretty", "raw"];
  const mode = modes.includes(preferredMode) ? preferredMode : modes[0];

  const language = editorLanguage(type);
  const pretty = useMemo(() => {
    const text = response.bodyText;
    if (text === null) return null;
    if (language === "json") return prettyJsonText(text);
    if (language === "text" && text.length < 1024 * 1024 && looksLikeJson(text)) {
      try {
        JSON.parse(text);
        return formatJson(text);
      } catch {
        return text;
      }
    }
    return text;
  }, [response.bodyText, language]);
  const detectedLanguage: EditorLanguage = language === "text" && pretty !== response.bodyText ? "json" : language;
  const tone = statusTone(response.status);

  async function save() {
    const name = (new URL(response.url).pathname.split("/").filter(Boolean).pop() ?? "response").replace(/\.[a-z0-9]+$/i, "") || "response";
    const saved = await bridge.saveFile({
      defaultName: `${name}.${fileExtension(type)}`,
      content: response.bodyFile ? "" : response.bodyBase64 ?? response.bodyText ?? "",
      encoding: response.bodyBase64 ? "base64" : "utf8",
      sourcePath: response.bodyFile
    });
    if (saved) useUi.getState().toast("Response saved");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-4 border-b border-line px-4">
        <nav className="flex h-full items-center gap-4" role="tablist">
          {(["body", "headers", "cookies"] as View[]).map((item) => (
            <button key={item} role="tab" className="subtab h-10" data-active={view === item} onClick={() => setView(item)}>
              {item === "body" ? "Body" : item === "headers" ? "Headers" : "Cookies"}
              {item === "headers" && <span className="count">{response.headers.length}</span>}
              {item === "cookies" && response.cookies.length > 0 && <span className="count">{response.cookies.length}</span>}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className={`flex items-center gap-1.5 font-semibold tone-${tone}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            <span className="font-mono">{response.status}</span>
            <span>{response.statusText}</span>
          </span>
          <span className="text-faint">
            <span className="font-mono text-muted">{formatDuration(response.timeMs)}</span>
          </span>
          <span className="font-mono text-muted">{formatBytes(response.sizeBytes)}</span>
        </div>
      </div>

      {view === "body" && (
        <>
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-4">
            <div className="seg">
              {modes.map((item) => (
                <button key={item} className="seg-item" data-active={mode === item} onClick={() => setMode(item)}>
                  {item === "pretty" ? "Pretty" : item === "raw" ? "Raw" : "Preview"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              {!isImage && (
                <button className="icon-btn" data-active={wrap} title={wrap ? "Don't wrap lines" : "Wrap lines"} onClick={() => setWrap((value) => !value)}>
                  <WrapText size={15} className={wrap ? "text-accent" : undefined} />
                </button>
              )}
              {response.bodyText !== null && (
                <button className="icon-btn" title="Copy body" onClick={() => copyText(response.bodyText ?? "", "Response copied")}>
                  <Copy size={14} />
                </button>
              )}
              <button className="icon-btn" title="Save response to a file" onClick={save}>
                <Download size={15} />
              </button>
            </div>
          </div>
          {response.truncated && response.bodyText !== null && (
            <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded border border-line bg-hover px-3 py-1.5 text-xs text-muted">
              <span>Showing the first 16 MB of {formatBytes(response.sizeBytes)} to keep memory use low.</span>
              <button className="btn-ghost h-6 px-1.5 text-xs" onClick={save}>
                Save full response
              </button>
            </div>
          )}
          <div className="mx-4 mb-4 min-h-0 flex-1 overflow-hidden rounded border border-line bg-field">
            {response.bodyText === null && !isImage ? (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">
                <div>
                  <div>Binary response ({formatBytes(response.sizeBytes)}, {response.contentType || "unknown type"}).</div>
                  <button className="btn mt-3" onClick={save}>
                    <Download size={14} />
                    Save to file
                  </button>
                </div>
              </div>
            ) : mode === "preview" && isImage ? (
              <div className="grid h-full place-items-center overflow-auto p-4" style={{ backgroundImage: "repeating-conic-gradient(var(--hover) 0 25%, transparent 0 50%)", backgroundSize: "16px 16px" }}>
                <img src={`data:${response.contentType.split(";")[0]};base64,${response.bodyBase64}`} alt="Response preview" className="max-h-full max-w-full object-contain" />
              </div>
            ) : mode === "preview" && isHtml ? (
              <iframe title="HTML preview" sandbox="" srcDoc={response.bodyText ?? ""} className="h-full w-full bg-white" />
            ) : response.sizeBytes === 0 || response.bodyText === "" ? (
              <div className="grid h-full place-items-center text-sm text-muted">The response has no body.</div>
            ) : mode === "raw" && (response.bodyText?.length ?? 0) > NATIVE_RAW_LIMIT ? (
              <textarea
                readOnly
                spellCheck={false}
                wrap={wrap ? "soft" : "off"}
                value={response.bodyText ?? ""}
                className="h-full w-full resize-none bg-transparent p-3 font-mono text-[12.5px] leading-[1.6] outline-none"
              />
            ) : (
              <CodeEditor value={mode === "pretty" ? pretty ?? "" : response.bodyText ?? ""} language={mode === "pretty" ? detectedLanguage : "text"} readOnly wrap={wrap} />
            )}
          </div>
        </>
      )}

      {view === "headers" && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <KeyValueList rows={response.headers} />
        </div>
      )}

      {view === "cookies" && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {response.cookies.length === 0 ? <p className="text-sm text-muted">The server did not set any cookies.</p> : <CookieTable cookies={response.cookies} />}
        </div>
      )}
    </div>
  );
}

function KeyValueList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="selectable overflow-hidden rounded border border-line">
      {rows.map(([key, value], index) => (
        <div key={`${key}-${index}`} className="grid grid-cols-[minmax(140px,34%)_1fr] border-b border-line text-xs last:border-b-0">
          <div className="break-words bg-sidebar px-3 py-2 font-medium text-muted">{key}</div>
          <div className="break-all px-3 py-2 font-mono">{value}</div>
        </div>
      ))}
    </div>
  );
}

function CookieTable({ cookies }: { cookies: string[] }) {
  const parsed = cookies.map((cookie) => {
    const [pair, ...attributes] = cookie.split(";");
    const eq = pair.indexOf("=");
    return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), attributes: attributes.map((item) => item.trim()).filter(Boolean) };
  });
  return (
    <div className="selectable overflow-hidden rounded border border-line text-xs">
      <div className="grid grid-cols-[minmax(100px,25%)_minmax(0,1fr)_minmax(0,1fr)] border-b border-line bg-sidebar font-medium text-muted">
        <div className="px-3 py-2">Name</div>
        <div className="px-3 py-2">Value</div>
        <div className="px-3 py-2">Attributes</div>
      </div>
      {parsed.map((cookie, index) => (
        <div key={index} className="grid grid-cols-[minmax(100px,25%)_minmax(0,1fr)_minmax(0,1fr)] border-b border-line last:border-b-0">
          <div className="break-words px-3 py-2 font-medium">{cookie.name}</div>
          <div className="break-all px-3 py-2 font-mono">{cookie.value}</div>
          <div className="px-3 py-2 text-muted">{cookie.attributes.join("; ")}</div>
        </div>
      ))}
    </div>
  );
}
