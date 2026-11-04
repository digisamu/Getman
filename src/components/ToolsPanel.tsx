import { Copy, RefreshCw, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { base64Decode, base64Encode, decodeJwt } from "../lib/tools";
import { copyText, useUi } from "../store/ui";

type Tool = "jwt" | "base64" | "json" | "uuid" | "time";

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: "jwt", label: "JWT" },
  { id: "base64", label: "Base64" },
  { id: "json", label: "JSON" },
  { id: "uuid", label: "UUID" },
  { id: "time", label: "Timestamp" }
];

export function ToolsPanel() {
  const [tool, setTool] = useState<Tool>("jwt");
  const close = () => useUi.getState().setToolsOpen(false);

  return (
    <aside className="chrome flex h-full w-[360px] shrink-0 flex-col border-l border-line">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <span className="text-sm font-semibold">Developer tools</span>
        <button className="icon-btn" onClick={close} aria-label="Close tools">
          <X size={15} />
        </button>
      </div>
      <div className="shrink-0 px-4 pt-3">
        <div className="seg flex w-full">
          {TOOLS.map((item) => (
            <button key={item.id} className="seg-item flex-1 px-1" data-active={tool === item.id} onClick={() => setTool(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tool === "jwt" && <JwtTool />}
        {tool === "base64" && <Base64Tool />}
        {tool === "json" && <JsonTool />}
        {tool === "uuid" && <UuidTool />}
        {tool === "time" && <TimestampTool />}
      </div>
    </aside>
  );
}

function Output({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {!tone && value && (
          <button className="btn-ghost h-6 px-1.5 text-xs" onClick={() => copyText(value)}>
            <Copy size={12} />
            Copy
          </button>
        )}
      </div>
      <pre className={`selectable max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border border-line bg-field p-2.5 font-mono text-xs ${tone === "danger" ? "text-danger" : ""}`}>{value || " "}</pre>
    </div>
  );
}

function Area({ value, onChange, placeholder, rows = 5 }: { value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return (
    <textarea
      className="input h-auto resize-y py-2 font-mono text-xs leading-5"
      rows={rows}
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-muted">{children}</p>;
}

function JwtTool() {
  const [token, setToken] = useState("");
  const result = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { ok: true as const, ...decodeJwt(token) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Invalid token" };
    }
  }, [token]);

  return (
    <div>
      <Hint>Decodes the header and payload locally. The signature is not verified.</Hint>
      <Area value={token} onChange={setToken} placeholder="Paste a JWT (with or without “Bearer”)" />
      {result && !result.ok && <Output label="Error" value={result.error} tone="danger" />}
      {result?.ok && (
        <>
          {result.expiresAt && (
            <div className={`mt-3 rounded border border-line px-2.5 py-2 text-xs ${result.expired ? "text-danger" : "text-success"}`}>
              {result.expired ? "Expired" : "Valid until"} {result.expiresAt.toLocaleString()}
            </div>
          )}
          <Output label="Header" value={JSON.stringify(result.header, null, 2)} />
          <Output label="Payload" value={JSON.stringify(result.payload, null, 2)} />
        </>
      )}
    </div>
  );
}

function Base64Tool() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const output = useMemo(() => {
    if (!input) return { value: "", error: false };
    try {
      return { value: mode === "encode" ? base64Encode(input) : base64Decode(input), error: false };
    } catch (error) {
      return { value: error instanceof Error ? error.message : "Invalid input", error: true };
    }
  }, [input, mode]);

  return (
    <div>
      <div className="seg mb-3">
        <button className="seg-item" data-active={mode === "encode"} onClick={() => setMode("encode")}>
          Encode
        </button>
        <button className="seg-item" data-active={mode === "decode"} onClick={() => setMode("decode")}>
          Decode
        </button>
      </div>
      <Area value={input} onChange={setInput} placeholder={mode === "encode" ? "Text to encode" : "Base64 or base64url to decode"} />
      <Output label="Result" value={output.value} tone={output.error ? "danger" : undefined} />
    </div>
  );
}

function JsonTool() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<"2" | "4" | "min">("2");
  const output = useMemo(() => {
    if (!input.trim()) return { value: "", error: false };
    try {
      const parsed = JSON.parse(input);
      return { value: indent === "min" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, Number(indent)), error: false };
    } catch (error) {
      return { value: error instanceof Error ? error.message : "Invalid JSON", error: true };
    }
  }, [input, indent]);

  return (
    <div>
      <div className="seg mb-3">
        {(["2", "4", "min"] as const).map((item) => (
          <button key={item} className="seg-item" data-active={indent === item} onClick={() => setIndent(item)}>
            {item === "min" ? "Minify" : `${item} spaces`}
          </button>
        ))}
      </div>
      <Area value={input} onChange={setInput} placeholder="Paste JSON to validate and format" rows={8} />
      <Output label={output.error ? "Error" : "Result"} value={output.value} tone={output.error ? "danger" : undefined} />
    </div>
  );
}

function UuidTool() {
  const generate = () => Array.from({ length: 5 }, () => crypto.randomUUID());
  const [uuids, setUuids] = useState(generate);
  return (
    <div>
      <Hint>Random version 4 UUIDs. Click one to copy it.</Hint>
      <div className="space-y-1.5">
        {uuids.map((uuid) => (
          <button key={uuid} className="flex w-full items-center justify-between rounded border border-line bg-field px-2.5 py-2 text-left font-mono text-xs hover:border-line-strong" onClick={() => copyText(uuid)}>
            {uuid}
            <Copy size={12} className="text-faint" />
          </button>
        ))}
      </div>
      <button className="btn mt-3" onClick={() => setUuids(generate())}>
        <RefreshCw size={13} />
        Generate new
      </button>
    </div>
  );
}

function TimestampTool() {
  const [input, setInput] = useState(() => String(Math.floor(Date.now() / 1000)));
  const result = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    const date = Number.isFinite(numeric) ? new Date(trimmed.length > 11 ? numeric : numeric * 1000) : new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [input]);

  return (
    <div>
      <Hint>Converts Unix seconds, milliseconds or an ISO date.</Hint>
      <div className="flex gap-2">
        <input className="input font-mono text-xs" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} />
        <button className="btn" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>
          Now
        </button>
      </div>
      {result ? (
        <>
          <Output label="Local time" value={result.toLocaleString()} />
          <Output label="ISO 8601 (UTC)" value={result.toISOString()} />
          <Output label="Unix seconds" value={String(Math.floor(result.getTime() / 1000))} />
          <Output label="Unix milliseconds" value={String(result.getTime())} />
        </>
      ) : (
        input.trim() && <Output label="Error" value="Not a recognised timestamp or date." tone="danger" />
      )}
    </div>
  );
}
