# Troubleshooting

## "The connection was refused"

Nothing is listening on that host and port. Check that your server is running and that the URL (or `{{BASE_URL}}`) points to the right port. `localhost:3000` is sent as `http://localhost:3000`.

## "The host name could not be resolved"

The domain does not exist or there is no network connection. Check the URL for typos and make sure a variable such as `{{BASE_URL}}` is defined in the active environment. Undefined variables are shown in red in the URL bar and are sent unchanged.

## Certificate errors

Servers with self-signed, expired or mismatched certificates are rejected by default. Open **Settings** and turn off **Verify SSL certificates** to allow them. Turn it back on when you are done.

## The request never finishes

Press `Esc` or click **Cancel**. To give up automatically, set **Request timeout** in **Settings** (in milliseconds; `0` waits indefinitely).

## A large response says "Showing the first 16 MB"

To keep memory use low on 8 GB machines, Getman displays at most 16 MB of a response. Click **Save full response** to write the complete body to a file.

## A response disappeared from a background tab

Getman keeps up to 64 MB of responses across all tabs. When you have several large responses open, the oldest ones in background tabs are cleared; send the request again to see it.

## A redirect is followed when I want to see it

Turn off **Follow redirects** in **Settings** to see the `3xx` response and its `Location` header.

## The JSON body shows a warning

The body is checked as you type. Variables are allowed anywhere, including unquoted (`{"id": {{USER_ID}}}`). The warning never blocks sending, so you can still send intentionally malformed JSON.

## My data is missing after updating from 0.1

Getman copies the old Tauri workspace (`com.getman.desktop/workspace.json` in the app-data folder) only when the new workspace file does not exist yet. If a new, empty workspace was created first, quit Getman, delete the new `workspace.json` (see the paths in the README) and start Getman again.

## Starting over

Quit Getman and delete `workspace.json`. A new workspace with sample requests is created on the next launch.

## Development issues

- **`npm run dev` says port 1420 is in use**: another Vite server is running. Stop it, or stop the process using the port.
- **Electron does not download during `npm install`**: set `ELECTRON_MIRROR` if you are behind a proxy, or run `npm rebuild electron`.
- **The packaged macOS app is blocked by Gatekeeper**: unsigned builds need to be opened with right-click → Open the first time, or signed with your own Developer ID.
