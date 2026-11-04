# User guide

## The window

- **Toolbar**: request tabs, active environment, theme, developer tools and settings.
- **Sidebar**: collections and history, with a filter box. Hide it with the sidebar button or ⌃⌘S (Ctrl+B on Windows and Linux).
- **Tabs** (in the toolbar): each open request has its own tab and keeps its own last response. A dot on a saved request's tab means it has unsaved changes. Italic names are requests not yet saved to a collection.
- **Request**: name, URL bar, then Params, Auth, Headers, Body and Code.
- **Response**: beside or below the request (change it in Settings). Drag the divider to resize; double-click it to reset.

## Sending a request

1. Pick a method from the menu at the left of the URL bar.
2. Type a URL. A missing scheme is added when sending: `api.example.com` becomes `https://api.example.com`, and `localhost:3000` becomes `http://localhost:3000`.
3. Press `⌘ Enter` / `Ctrl Enter` or click **Send**. Press `Esc` or click **Cancel** to stop it.

Paste a cURL command into the URL bar to turn it into a request, including method, headers, body and auth.

## Query parameters

Parameters you type in the URL appear in the **Params** table, and edits in the table update the URL. Unticking a row removes it from the URL but keeps it in the table, so you can switch it back on later. **Bulk edit** lets you paste `key: value` lines.

## Headers

Start typing in the last row to add a header; common header names are suggested. Untick a row to stop sending it, or use the bin icon to delete it.

## Auth

- **Bearer token**: sent as `Authorization: Bearer <token>`.
- **Basic auth**: sent as `Authorization: Basic <base64(username:password)>`.

If you add your own `Authorization` header, it wins.

## Body

| Type | Sent as |
| --- | --- |
| None | No body |
| JSON | The text you type, with `Content-Type: application/json` unless you set one |
| Text | The text you type, with `Content-Type: text/plain` unless you set one |
| Form data | `multipart/form-data` |
| URL-encoded | `application/x-www-form-urlencoded` |

`GET` and `HEAD` requests never send a body. **Beautify** formats valid JSON.

## Environments and variables

Write variables as `{{NAME}}` anywhere in the URL, params, headers, auth or body. They are green when the active environment defines them and red when it does not.

Choose the active environment from the toolbar, or pick **Manage environments…** to add, rename, duplicate or delete environments and edit their variables.

## Collections

Collections contain folders, and folders contain requests.

- **Save** (`⌘ S`) updates the saved request a tab came from, or asks where to save a new one.
- **Save as…** (`⌘ ⇧ S`) saves a copy anywhere, including into a new collection or folder.
- Use the `…` menu on a row, or double-click its name, to rename, duplicate, add folders or requests, export or delete.
- **Import** reads Postman v2.0/v2.1 collections and collections exported from Getman. **Export** writes Postman v2.1, which Postman, Insomnia and Bruno can import.

## History

Every request you send is recorded with its status and time, grouped by day (the 200 most recent are kept). Click an entry to open it in a new tab.

## Response

- The status is green for 2xx, blue for 3xx, amber for 4xx and red for 5xx.
- **Pretty** formats JSON; **Raw** shows the exact text; **Preview** renders HTML (scripts disabled) and images.
- Use the toolbar to wrap lines, copy the body or save it to a file. `⌘ F` searches inside the body.
- **Headers** and **Cookies** list what the server returned.

## Code

The **Code** tab shows the current request, with variables resolved, as cURL, JavaScript `fetch`, Python `requests` or Java `HttpClient`. **Copy** copies the selected language.

## Developer tools

The wrench opens a side panel with a JWT decoder (shows expiry), Base64 encode/decode (including base64url), a JSON formatter, a UUID v4 generator and a timestamp converter. Everything runs locally.

## Settings

- **Request timeout** in milliseconds (`0` = no limit)
- **Verify SSL certificates**
- **Follow redirects**
- **Response position**: beside or below the request
- **Glass effects**: the translucent sidebar and toolbar. On by default on macOS. On Windows 11 you can turn it on to use the Mica material. Turns off automatically when Reduce transparency is on in your system settings.

## Privacy

Getman has no accounts, cloud sync, telemetry or analytics. The only network traffic is the requests you send.
