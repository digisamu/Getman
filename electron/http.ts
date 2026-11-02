import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { open, unlink, type FileHandle } from "node:fs/promises";
import { STATUS_CODES } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Agent, FormData, Headers, fetch } from "undici";
import type { HttpRequestPayload, HttpResponsePayload } from "../src/shared/ipc";

// Two pooled keep-alive agents: repeat requests to the same host skip the TCP/TLS handshake.
const strictAgent = new Agent({ keepAliveTimeout: 30_000, connect: { timeout: 15_000 } });
const insecureAgent = new Agent({ keepAliveTimeout: 30_000, connect: { timeout: 15_000, rejectUnauthorized: false } });

const BODYLESS = new Set(["GET", "HEAD"]);
const TEXT_TYPES = /^(text\/|application\/(.+\+)?(json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|yaml|x-yaml|problem\+json))/i;
// At most this much of a response is held in memory and sent to the window. Anything larger is
// streamed to a temp file so it can still be saved in full without exhausting RAM on 8 GB machines.
const PREVIEW_LIMIT = 16 * 1024 * 1024;
const KEPT_RESPONSE_FILES = 5;
const RESPONSE_FILE_PREFIX = "getman-response-";
const responseFiles: string[] = [];

const ERROR_HINTS: Record<string, string> = {
  ENOTFOUND: "The host name could not be resolved. Check the URL or your network connection.",
  ECONNREFUSED: "The connection was refused. Is the server running on that port?",
  ECONNRESET: "The server closed the connection unexpectedly.",
  ETIMEDOUT: "The connection timed out.",
  UND_ERR_CONNECT_TIMEOUT: "Connecting to the server timed out.",
  EHOSTUNREACH: "The host is unreachable from this network.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "The server uses a self-signed certificate. Turn off SSL verification in Settings to allow it.",
  SELF_SIGNED_CERT_IN_CHAIN: "The certificate chain contains a self-signed certificate. Turn off SSL verification in Settings to allow it.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "The server certificate could not be verified. Turn off SSL verification in Settings to allow it.",
  CERT_HAS_EXPIRED: "The server certificate has expired. Turn off SSL verification in Settings to allow it.",
  ERR_TLS_CERT_ALTNAME_INVALID: "The certificate does not match the host name."
};

const inflight = new Map<string, AbortController>();

function describeError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const code = cause?.code ?? (error as { code?: string })?.code;
  if (code && ERROR_HINTS[code]) return ERROR_HINTS[code];
  if (cause?.message) return cause.message;
  return error instanceof Error ? error.message : String(error);
}

function isTextual(contentType: string, buffer: Buffer) {
  if (!contentType) {
    // No content type: treat as text unless it contains NUL bytes in the first chunk.
    return !buffer.subarray(0, 1024).includes(0);
  }
  return TEXT_TYPES.test(contentType) || /charset=/i.test(contentType);
}

function rememberResponseFile(file: string) {
  responseFiles.push(file);
  while (responseFiles.length > KEPT_RESPONSE_FILES) void unlink(responseFiles.shift()!).catch(() => undefined);
}

export function removeResponseFiles() {
  for (const file of responseFiles.splice(0)) {
    try {
      unlinkSync(file);
    } catch {
      // Already gone.
    }
  }
}

async function readBody(stream: AsyncIterable<Uint8Array> | null) {
  const preview: Buffer[] = [];
  let kept = 0;
  let size = 0;
  let file: string | null = null;
  let out: FileHandle | null = null;
  try {
    for await (const chunk of stream ?? []) {
      const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      size += buffer.byteLength;
      if (!out && kept + buffer.byteLength <= PREVIEW_LIMIT) {
        preview.push(buffer);
        kept += buffer.byteLength;
        continue;
      }
      if (!out) {
        file = path.join(tmpdir(), `${RESPONSE_FILE_PREFIX}${randomUUID()}`);
        out = await open(file, "w");
        for (const part of preview) await out.write(part);
      }
      await out.write(buffer);
      if (kept < PREVIEW_LIMIT) {
        const part = buffer.subarray(0, PREVIEW_LIMIT - kept);
        preview.push(part);
        kept += part.byteLength;
      }
    }
  } catch (error) {
    await out?.close();
    if (file) await unlink(file).catch(() => undefined);
    throw error;
  }
  await out?.close();
  if (file) rememberResponseFile(file);
  return { preview: Buffer.concat(preview, kept), size, file };
}

export function cancelHttpRequest(id: string) {
  inflight.get(id)?.abort("cancelled");
}

export async function executeHttpRequest(id: string, payload: HttpRequestPayload): Promise<HttpResponsePayload> {
  const controller = new AbortController();
  inflight.set(id, controller);
  const startedAt = performance.now();
  let timedOut = false;
  const timer =
    payload.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort("timeout");
        }, payload.timeoutMs)
      : undefined;

  try {
    const method = payload.method.toUpperCase();
    let body: string | FormData | undefined;
    if (payload.body && !BODYLESS.has(method)) {
      if (payload.body.kind === "text") {
        body = payload.body.text;
      } else {
        const form = new FormData();
        payload.body.fields.forEach(([key, value]) => form.append(key, value));
        body = form;
      }
    }

    const headers = new Headers();
    for (const [key, value] of payload.headers) {
      // Let undici generate the multipart boundary.
      if (body instanceof FormData && key.toLowerCase() === "content-type") continue;
      headers.append(key, value);
    }

    const response = await fetch(payload.url, {
      method,
      headers,
      body,
      redirect: payload.followRedirects ? "follow" : "manual",
      signal: controller.signal,
      dispatcher: payload.verifySsl ? strictAgent : insecureAgent
    });

    const { preview, size, file } = await readBody(response.body);
    const timeMs = Math.round(performance.now() - startedAt);
    const contentType = response.headers.get("content-type") ?? "";
    const textual = method === "HEAD" || isTextual(contentType, preview);

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText || STATUS_CODES[response.status] || "",
      url: response.url || payload.url,
      headers: [...response.headers.entries()],
      cookies: response.headers.getSetCookie(),
      contentType,
      timeMs,
      sizeBytes: size,
      bodyText: textual ? preview.toString("utf8") : null,
      bodyBase64: !textual && !file ? preview.toString("base64") : null,
      truncated: file !== null,
      bodyFile: file
    };
  } catch (error) {
    const timeMs = Math.round(performance.now() - startedAt);
    if (controller.signal.aborted) {
      return timedOut
        ? { ok: false, error: `The request timed out after ${payload.timeoutMs} ms.`, timeMs }
        : { ok: false, error: "Request cancelled.", cancelled: true, timeMs };
    }
    return { ok: false, error: describeError(error), timeMs };
  } finally {
    clearTimeout(timer);
    inflight.delete(id);
  }
}
