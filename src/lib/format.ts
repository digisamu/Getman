export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function statusTone(status: number) {
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  if (status >= 300) return "info";
  return "success";
}

export function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const INDENTS: string[] = [""];
const indent = (depth: number) => (INDENTS[depth] ??= "  ".repeat(depth));

/**
 * Re-indents JSON text in a single pass without parsing it into objects. It is several times
 * lighter on memory than JSON.parse + JSON.stringify, keeps numbers exactly as sent (64-bit IDs are
 * not rounded), and copes with a body that was cut off mid-document.
 */
export function formatJson(text: string) {
  const out: string[] = [];
  let depth = 0;
  let segment = 0;
  let inString = false;
  const length = text.length;
  for (let i = 0; i < length; i++) {
    const code = text.charCodeAt(i);
    if (inString) {
      if (code === 92) i++; // backslash: skip the escaped character
      else if (code === 34) inString = false;
      continue;
    }
    switch (code) {
      case 34: // "
        inString = true;
        break;
      case 123: // {
      case 91: {
        // [
        out.push(text.slice(segment, i + 1));
        let next = i + 1;
        while (next < length && /\s/.test(text[next])) next++;
        const close = code === 123 ? 125 : 93;
        if (text.charCodeAt(next) === close) {
          out.push(text[next]);
          i = next;
        } else {
          out.push("\n", indent(++depth));
        }
        segment = i + 1;
        break;
      }
      case 125: // }
      case 93: // ]
        out.push(text.slice(segment, i), "\n", indent(Math.max(0, --depth)), text[i]);
        segment = i + 1;
        break;
      case 44: // ,
        out.push(text.slice(segment, i + 1), "\n", indent(depth));
        segment = i + 1;
        break;
      case 58: // :
        out.push(text.slice(segment, i + 1), " ");
        segment = i + 1;
        break;
      case 32:
      case 9:
      case 10:
      case 13:
        if (i > segment) out.push(text.slice(segment, i));
        segment = i + 1;
        break;
    }
  }
  out.push(text.slice(segment));
  return out.join("");
}

/**
 * Pretty-prints a JSON response. The native parser is fastest, but it rounds integers above 2^53
 * (16+ digits) and rejects a body cut off by the size limit, so those cases use formatJson.
 */
export function prettyJsonText(text: string) {
  if (!/\d{16}/.test(text)) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Not complete JSON; fall through to the tolerant formatter.
    }
  }
  return formatJson(text);
}

export function looksLikeJson(text: string) {
  const first = text.trimStart()[0];
  return first === "{" || first === "[";
}
