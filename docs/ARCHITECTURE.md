# Architecture

Getman is an Electron app with a React renderer. The renderer never touches the network or the file system directly; it asks the main process through a small, typed bridge.

```text
┌──────────────── Renderer (React, sandboxed) ────────────────┐
│ components/  UI                                             │
│ store/       zustand stores: workspace, responses, ui       │
│ lib/         pure logic: url, variables, request, snippets, │
│              curl, postman, migrate, format, tools          │
│ lib/bridge   window.getman, or a browser fallback           │
└────────────────────────────┬────────────────────────────────┘
                             │ contextBridge + IPC (src/shared/ipc.ts)
┌────────────────────────────┴────────────────────────────────┐
│ electron/preload.ts   exposes window.getman                 │
│ electron/main.ts      window, menu, workspace file, dialogs │
│ electron/http.ts      undici HTTP engine                    │
└─────────────────────────────────────────────────────────────┘
```

## Processes

- **Main** (`electron/main.ts`) creates a single hardened window (`contextIsolation`, `sandbox`, no Node integration, external links opened in the system browser), builds the native menu, and handles IPC: loading and saving the workspace, sending and cancelling requests, and file dialogs.
- **Preload** (`electron/preload.ts`) exposes the `GetmanBridge` defined in `src/shared/ipc.ts`.
- **Renderer** (`src/`) is a Vite + React 18 app. In production it is served from `app://getman`, a privileged scheme with V8 code caching, so after the first launch its JavaScript is not re-compiled. It runs under a strict Content Security Policy.

Main and preload are bundled with esbuild (`scripts/build-electron.mjs`), so the packaged app ships no `node_modules`. The HTTP engine is a separate bundle (`http.cjs`) that main loads on the first request.

## Startup and performance

- The first screen needs only ~240 KB of JavaScript. CodeMirror (`CodeEditorImpl.tsx`) is a separate chunk that is fetched once the app is idle, and every grammar except JSON is fetched the first time it is needed.
- Components subscribe to the smallest slice of state they need; typing in a request does not re-render the sidebar or the response.
- Autosave is debounced and serialised during idle time.
- Hidden or minimised windows are throttled by Chromium, so the app uses almost no CPU in the background.

## HTTP

`electron/http.ts` sends requests with undici using two pooled keep-alive agents (one that verifies TLS certificates, one that does not). It supports cancellation, timeouts, redirect control and multipart bodies, and returns:

- status, status text, final URL, headers, `Set-Cookie` values
- total time and body size in bytes
- the body as text, or as base64 for binary content (used for image preview and saving)

At most 16 MB of a body is kept in memory and sent to the window. Larger bodies are streamed to a temp file (deleted on quit) so **Save full response** still writes everything.

Network errors are translated into plain explanations (DNS failure, connection refused, certificate problems, timeouts).

`src/lib/request.ts` turns an editable request into exactly what is sent: variables resolved, the scheme added when missing, auth headers applied, and a `Content-Type` added only when the user has not set one.

## State

- `store/workspace.ts` holds everything that is persisted: tabs, collections, environments, history, settings and layout.
- `store/responses.ts` keeps the last response per tab in memory only, up to 64 MB of bodies across all tabs; older responses in background tabs are dropped first.
- `store/ui.ts` holds dialogs, toasts and panel visibility.

Components subscribe to the smallest slice they need, so typing in one field does not re-render the rest of the app.

The URL is the single source of truth for enabled query parameters; `lib/url.ts` keeps the params table in sync with it while keeping row ids stable and disabled rows in place.

## Persistence

`store/persistence.ts` loads the workspace once before the first render and then saves it 400 ms after the last change, only when persisted data changed. Pending changes are flushed synchronously when the window closes. The main process writes to a temporary file and renames it, so a crash never leaves a half-written workspace.

`lib/migrate.ts` normalises whatever is on disk, including the 0.1 Tauri format (single active request, params outside the URL, default `{}` JSON bodies) and partially corrupted files.

## Updates

`electron/updater.ts` (loaded on first use) asks the GitHub Releases API for the latest version. Getman is not signed with a paid Apple certificate, so Electron's built-in updater cannot be used; instead the updater downloads the release asset for the current platform, checks its size and SHA-256 digest, and:

- **macOS:** unpacks the `.zip`, verifies the bundle's signature, and hands over to a small shell script that waits for Getman to quit, moves the old bundle aside, copies the new one into place (restoring the old one if that fails) and reopens the app.
- **Windows:** runs the NSIS installer silently (`/S --force-run`) after Getman quits.
- **Linux AppImage:** downloads next to the current file, renames it into place and starts it.

Progress is pushed to the renderer with `update:progress`. Updates are refused when the copy cannot replace itself (development builds, a read-only location, macOS App Translocation or running from the disk image), and Settings explains why.

## Theming

All colours come from CSS variables defined per theme in `src/styles.css` and mapped into Tailwind (`tailwind.config.js`). The interface uses system fonts (SF Pro and SF Mono on macOS, Segoe UI Variable and Cascadia Mono on Windows), so nothing is downloaded before the first paint; only the Sydney wordmark bundles a face (Bodoni Moda).

### Glass

The window frame (sidebar, toolbar, tools panel) sits on a native material: `vibrancy: "sidebar"` on macOS and Mica on Windows 11 22H2+. The operating system's compositor draws it, so it costs almost nothing. The workbench stays opaque for legibility and speed. While the window is being dragged (`will-move` → `moved`), the main process swaps the glass for a solid frame and tells the page (`window:dragging`), so macOS does not have to re-blur the area behind the window on every frame of the move. CSS `backdrop-filter` is used only on small, short-lived surfaces (menus, dialogs, toasts).

The renderer asks for an appearance (`window:appearance`) with the theme's light/dark mode and the Glass effects setting. The main process applies `nativeTheme.themeSource` and the material, and returns what is really in effect: glass is off when unsupported or when the user has turned on Reduce transparency. That decides `data-translucent` on `<html>`. The state for the first paint arrives through the preload (`initialAppearance`), so the window never flashes. Changes to the accent colour or to Reduce transparency are pushed back with `appearance:changed`.
