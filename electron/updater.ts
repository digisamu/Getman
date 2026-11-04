import { app, net } from "electron";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { UpdateInfo, UpdateProgress } from "../src/shared/ipc";

// Getman is not signed with a paid Apple certificate, so Electron's built-in updater (Squirrel)
// cannot be used on macOS. This module checks GitHub Releases and swaps the app itself.

const REPO = "digisamu/Getman";
const WORK_PREFIX = "getman-update-";
const run = promisify(execFile);

type ReleaseAsset = { name: string; size: number; browser_download_url: string; digest?: string | null };
type Release = { tag_name: string; html_url: string; body: string | null; published_at: string; assets: ReleaseAsset[] };

let latestRelease: Release | null = null;

function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

function assetName() {
  if (process.platform === "darwin") return `Getman-mac-${process.arch === "arm64" ? "arm64" : "x64"}.zip`;
  if (process.platform === "win32") return "Getman-windows-setup.exe";
  if (process.platform === "linux" && process.env.APPIMAGE) return "Getman-linux.AppImage";
  return null;
}

/** The .app bundle that is running, e.g. /Applications/Getman.app. */
const macBundle = () => path.resolve(process.execPath, "../../..");

async function writable(directory: string) {
  try {
    await access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Whether this copy can replace itself, and if not, what the user should do instead. */
async function installBlocker(): Promise<string | null> {
  if (!app.isPackaged) return "Updates install in the packaged app, not in development.";
  if (!assetName()) return "This install was not made from an AppImage, so update it with your package manager.";
  if (process.platform === "darwin") {
    const bundle = macBundle();
    if (bundle.includes("/AppTranslocation/") || bundle.startsWith("/Volumes/")) return "Move Getman to your Applications folder to install updates.";
    if (!(await writable(path.dirname(bundle)))) return `Getman can't write to ${path.dirname(bundle)}. Download the update instead.`;
  }
  if (process.platform === "linux" && !(await writable(path.dirname(process.env.APPIMAGE!)))) return "Getman can't replace its AppImage file. Download the update instead.";
  return null;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Getman/${app.getVersion()}` }
  });
  if (!response.ok) throw new Error(response.status === 403 ? "GitHub is rate-limiting update checks. Try again in a few minutes." : `GitHub answered ${response.status}.`);
  const release = (await response.json()) as Release;
  latestRelease = release;
  const latest = release.tag_name.replace(/^v/, "");
  const blocker = await installBlocker();
  const asset = release.assets.find((item) => item.name === assetName());
  return {
    current: app.getVersion(),
    latest,
    available: compareVersions(latest, app.getVersion()) > 0,
    notes: release.body ?? "",
    url: release.html_url,
    publishedAt: release.published_at,
    canInstall: !blocker && Boolean(asset),
    reason: blocker ?? (asset ? null : "This release has no installer for your system.")
  };
}

async function download(asset: ReleaseAsset, file: string, onProgress: (progress: UpdateProgress) => void) {
  const response = await net.fetch(asset.browser_download_url, { headers: { "User-Agent": `Getman/${app.getVersion()}` } });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}).`);
  const hash = createHash("sha256");
  const out = createWriteStream(file);
  const reader = response.body.getReader();
  let received = 0;
  let lastReport = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.byteLength;
      if (!out.write(value)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
      if (Date.now() - lastReport > 100) {
        lastReport = Date.now();
        onProgress({ phase: "downloading", received, total: asset.size });
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
  }
  if (received !== asset.size) throw new Error("The download was incomplete. Try again.");
  const expected = asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : null;
  if (expected && hash.digest("hex") !== expected) throw new Error("The download did not match its checksum, so it was not installed.");
  onProgress({ phase: "installing", received, total: asset.size });
}

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

async function installMac(zip: string, work: string) {
  const extracted = path.join(work, "extracted");
  await run("ditto", ["-x", "-k", zip, extracted]);
  const fresh = path.join(extracted, "Getman.app");
  await access(path.join(fresh, "Contents", "MacOS", "Getman"));
  await run("codesign", ["--verify", "--deep", fresh]);
  const bundle = macBundle();
  // Swap after this process exits. The old copy is kept until the new one is in place, and restored on failure.
  const script = `#!/bin/sh
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
mv ${shellQuote(bundle)} ${shellQuote(path.join(work, "previous.app"))} || exit 1
if ditto ${shellQuote(fresh)} ${shellQuote(bundle)}; then
  xattr -dr com.apple.quarantine ${shellQuote(bundle)} 2>/dev/null
  open ${shellQuote(bundle)}
  rm -rf ${shellQuote(work)}
else
  rm -rf ${shellQuote(bundle)}
  mv ${shellQuote(path.join(work, "previous.app"))} ${shellQuote(bundle)}
  open ${shellQuote(bundle)}
fi
`;
  const scriptPath = path.join(work, "install.sh");
  await writeFile(scriptPath, script, { mode: 0o755 });
  spawn("/bin/sh", [scriptPath], { detached: true, stdio: "ignore" }).unref();
}

function installWindows(installer: string) {
  // Give Getman a moment to exit, then run the NSIS installer silently; --force-run relaunches the app.
  spawn("cmd.exe", ["/d", "/c", `ping 127.0.0.1 -n 3 >nul & start "" "${installer}" /S --force-run`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }).unref();
}

async function installAppImage(file: string) {
  const target = process.env.APPIMAGE!;
  await chmod(file, 0o755);
  await rename(file, target);
  spawn(target, [], { detached: true, stdio: "ignore" }).unref();
}

/** Downloads and installs the release found by the last check, then quits so the new version can start. */
export async function installUpdate(onProgress: (progress: UpdateProgress) => void) {
  const blocker = await installBlocker();
  if (blocker) throw new Error(blocker);
  const release = latestRelease;
  const asset = release?.assets.find((item) => item.name === assetName());
  if (!release || !asset) throw new Error("Check for updates first.");

  // Clear folders left by an earlier download that was interrupted (app quit, network dropped).
  for (const entry of await readdir(tmpdir()).catch(() => [] as string[])) {
    if (entry.startsWith(WORK_PREFIX)) await rm(path.join(tmpdir(), entry), { recursive: true, force: true });
  }
  const work = path.join(tmpdir(), `${WORK_PREFIX}${randomUUID()}`);
  await mkdir(work, { recursive: true });
  // The AppImage is downloaded next to itself so it can be renamed into place (temp may be another disk).
  const file = process.platform === "linux" ? `${process.env.APPIMAGE}.download` : path.join(work, asset.name);
  try {
    await download(asset, file, onProgress);
    if (process.platform === "darwin") await installMac(file, work);
    else if (process.platform === "win32") installWindows(file);
    else await installAppImage(file);
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    if (process.platform === "linux") await rm(file, { force: true });
    throw error;
  }
  setTimeout(() => app.quit(), 300);
}
