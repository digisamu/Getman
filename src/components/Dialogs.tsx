import { Copy, Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { bridge, isDesktop, isMac } from "../lib/bridge";
import { formatBytes } from "../lib/format";
import { checkForUpdates, installUpdate, useUpdates } from "../store/updates";
import { useUi, type Dialog } from "../store/ui";
import { useWorkspace } from "../store/workspace";
import { KeyValueTable } from "./KeyValueTable";
import { Modal } from "./ui/Modal";

export function DialogHost() {
  const dialog = useUi((state) => state.dialog);
  const close = useUi((state) => state.closeDialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case "save":
      return <SaveDialog dialog={dialog} onClose={close} />;
    case "environments":
      return <EnvironmentsDialog initialId={dialog.environmentId} onClose={close} />;
    case "settings":
      return <SettingsDialog onClose={close} />;
    case "confirm":
      return <ConfirmDialog dialog={dialog} onClose={close} />;
  }
}

function ConfirmDialog({ dialog, onClose }: { dialog: Extract<Dialog, { kind: "confirm" }>; onClose: () => void }) {
  return (
    <Modal
      title={dialog.title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            autoFocus
            className={dialog.danger ? "btn-danger" : "btn-primary"}
            onClick={() => {
              onClose();
              dialog.onConfirm();
            }}
          >
            {dialog.confirmLabel}
          </button>
        </>
      }
    >
      <p className="px-5 py-4 text-sm text-muted">{dialog.message}</p>
    </Modal>
  );
}

function SaveDialog({ dialog, onClose }: { dialog: Extract<Dialog, { kind: "save" }>; onClose: () => void }) {
  const tab = useWorkspace((state) => state.tabs.find((item) => item.id === dialog.tabId));
  const collections = useWorkspace((state) => state.collections);
  const [name, setName] = useState(tab?.request.name === "Untitled request" ? "" : tab?.request.name ?? "");
  const [collectionId, setCollectionId] = useState(tab?.source?.collectionId ?? collections[0]?.id ?? "new");
  const collection = collections.find((item) => item.id === collectionId);
  const [folderId, setFolderId] = useState(tab?.source?.folderId ?? collection?.folders[0]?.id ?? "new");
  const [newName, setNewName] = useState("");

  if (!tab) return null;

  function save() {
    const store = useWorkspace.getState();
    let targetCollection = collectionId;
    let targetFolder = folderId;
    if (targetCollection === "new") {
      targetCollection = store.createCollection(newName.trim() || "New collection");
      targetFolder = useWorkspace.getState().collections.find((item) => item.id === targetCollection)!.folders[0].id;
    } else if (targetFolder === "new" || !collection?.folders.some((folder) => folder.id === targetFolder)) {
      targetFolder = store.addFolder(targetCollection, newName.trim() || "Requests");
    }
    store.saveTabAs(tab!.id, targetCollection, targetFolder, name.trim() || tab!.request.url || "Untitled request");
    useUi.getState().toast("Request saved");
    onClose();
    if (dialog.closeAfter) store.closeTab(tab!.id);
  }

  const needsNewName = collectionId === "new" || folderId === "new" || !collection?.folders.length;

  return (
    <Modal
      title="Save request"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <form
        className="space-y-4 px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="field-label">Request name</span>
          <input autoFocus className="input" value={name} placeholder={tab.request.url || "Untitled request"} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">Collection</span>
            <select
              className="input"
              value={collectionId}
              onChange={(event) => {
                setCollectionId(event.target.value);
                setFolderId(collections.find((item) => item.id === event.target.value)?.folders[0]?.id ?? "new");
              }}
            >
              {collections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="new">New collection…</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Folder</span>
            <select className="input" value={folderId} disabled={collectionId === "new"} onChange={(event) => setFolderId(event.target.value)}>
              {collection?.folders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="new">New folder…</option>
            </select>
          </label>
        </div>
        {needsNewName && (
          <label className="block">
            <span className="field-label">{collectionId === "new" ? "New collection name" : "New folder name"}</span>
            <input className="input" value={newName} placeholder={collectionId === "new" ? "New collection" : "Requests"} onChange={(event) => setNewName(event.target.value)} />
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function EnvironmentsDialog({ initialId, onClose }: { initialId?: string; onClose: () => void }) {
  const environments = useWorkspace((state) => state.environments);
  const activeEnvironmentId = useWorkspace((state) => state.activeEnvironmentId);
  const [selectedId, setSelectedId] = useState(initialId ?? environments[0]?.id ?? null);
  const selected = environments.find((env) => env.id === selectedId) ?? environments[0];
  const store = useWorkspace.getState;

  return (
    <Modal title="Environments" onClose={onClose} width={820}>
      <div className="flex h-[480px]">
        <div className="flex w-56 shrink-0 flex-col border-r border-line bg-sidebar">
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {environments.map((env) => (
              <button
                key={env.id}
                className={`flex h-8 w-full items-center gap-2 rounded px-2.5 text-left text-sm ${env.id === selected?.id ? "bg-selected" : "hover:bg-hover"}`}
                onClick={() => setSelectedId(env.id)}
              >
                <span className="flex-1 truncate">{env.name}</span>
                {env.id === activeEnvironmentId && <span className="text-2xs text-accent">Active</span>}
              </button>
            ))}
          </div>
          <div className="border-t border-line p-1.5">
            <button className="btn-ghost w-full justify-start" onClick={() => setSelectedId(store().addEnvironment())}>
              <Plus size={14} />
              New environment
            </button>
          </div>
        </div>

        {selected ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <input className="input h-8 flex-1 font-medium" value={selected.name} onChange={(event) => store().renameEnvironment(selected.id, event.target.value)} aria-label="Environment name" />
              <button
                className={selected.id === activeEnvironmentId ? "btn" : "btn-primary"}
                onClick={() => store().setActiveEnvironment(selected.id === activeEnvironmentId ? null : selected.id)}
              >
                {selected.id === activeEnvironmentId ? "Deactivate" : "Use this environment"}
              </button>
              <button className="icon-btn h-8 w-8" title="Duplicate" onClick={() => setSelectedId(store().duplicateEnvironment(selected.id))}>
                <Copy size={14} />
              </button>
              <button
                className="icon-btn h-8 w-8 hover:text-danger"
                title="Delete environment"
                onClick={() => {
                  store().deleteEnvironment(selected.id);
                  setSelectedId(useWorkspace.getState().environments[0]?.id ?? null);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <KeyValueTable
                key={selected.id}
                title="Use variables as {{NAME}} in the URL, headers, auth and body."
                rows={selected.variables}
                onChange={(rows) => store().setEnvironmentVariables(selected.id, rows)}
                keyPlaceholder="Add variable"
              />
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-muted">Create an environment to store variables like BASE_URL and TOKEN.</div>
        )}
      </div>
    </Modal>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useWorkspace((state) => state.settings);
  const update = useWorkspace((state) => state.updateSettings);
  const appearance = useUi((state) => state.appearance);
  const glassDescription = !appearance?.supported
    ? isMac
      ? "Available in the desktop app."
      : "Needs Windows 11 (22H2 or newer)."
    : appearance.reducedTransparency
      ? "Off because Reduce transparency is on in your system settings."
      : isMac
        ? "Translucent sidebar and toolbar, drawn by macOS."
        : "Mica material behind the sidebar and toolbar.";

  return (
    <Modal title="Settings" onClose={onClose} width={480}>
      <div className="divide-y divide-line">
        <UpdatesSection />
        <Setting title="Check for updates automatically" description="Look for a new version shortly after Getman starts.">
          <Toggle checked={settings.autoUpdate && isDesktop} disabled={!isDesktop} onChange={(autoUpdate) => update({ autoUpdate })} />
        </Setting>
        <Setting title="Request timeout" description="Stop waiting after this many milliseconds. 0 waits until the server answers.">
          <input
            type="number"
            min={0}
            step={1000}
            className="input w-28 text-right font-mono text-xs"
            value={settings.timeoutMs}
            onChange={(event) => update({ timeoutMs: Math.max(0, Number(event.target.value) || 0) })}
          />
        </Setting>
        <Setting title="Verify SSL certificates" description="Turn off to call servers with self-signed or expired certificates.">
          <Toggle checked={settings.verifySsl} onChange={(verifySsl) => update({ verifySsl })} />
        </Setting>
        <Setting title="Follow redirects" description="Follow 3xx responses automatically instead of showing them.">
          <Toggle checked={settings.followRedirects} onChange={(followRedirects) => update({ followRedirects })} />
        </Setting>
        <Setting title="Glass effects" description={glassDescription}>
          <Toggle checked={settings.translucency && Boolean(appearance?.supported)} disabled={!appearance?.supported} onChange={(translucency) => update({ translucency })} />
        </Setting>
        <Setting title="Response position" description="Show the response beside the request or below it.">
          <div className="seg">
            <button className="seg-item" data-active={settings.layout === "horizontal"} onClick={() => update({ layout: "horizontal" })}>
              Beside
            </button>
            <button className="seg-item" data-active={settings.layout === "vertical"} onClick={() => update({ layout: "vertical" })}>
              Below
            </button>
          </div>
        </Setting>
      </div>
    </Modal>
  );
}

function UpdatesSection() {
  const state = useUpdates((store) => store.state);
  const version = bridge.appVersion;
  let description: React.ReactNode = "Check GitHub for a newer version.";
  let action: React.ReactNode = (
    <button className="btn" disabled={!isDesktop || state.status === "checking"} onClick={() => void checkForUpdates()}>
      <RefreshCw size={13} className={state.status === "checking" ? "animate-spin" : undefined} />
      {state.status === "checking" ? "Checking…" : "Check for updates"}
    </button>
  );

  if (!isDesktop) description = "Updates are available in the desktop app.";
  else if (state.status === "current") description = "You have the latest version.";
  else if (state.status === "error") description = <span className="text-danger">{state.error}</span>;

  if (state.status === "available" || (state.status === "error" && state.info?.available)) {
    const info = state.info!;
    description = (
      <>
        Version {info.latest} is available.{" "}
        <a className="text-accent hover:underline" href={info.url} target="_blank" rel="noreferrer">
          What's new
        </a>
        {!info.canInstall && info.reason && <span className="mt-1 block">{info.reason}</span>}
        {state.status === "error" && <span className="mt-1 block text-danger">{state.error}</span>}
      </>
    );
    action = (
      <button className="btn-primary" onClick={() => void installUpdate()}>
        <Download size={13} />
        {info.canInstall ? `Update to ${info.latest}` : "Download"}
      </button>
    );
  }

  if (state.status === "installing") {
    const { progress, info } = state;
    const percent = progress ? Math.round((progress.received / progress.total) * 100) : 0;
    description =
      progress?.phase === "installing" ? (
        "Installing… Getman will restart in a moment."
      ) : (
        <>
          Downloading {info.latest}… {progress ? `${percent}% of ${formatBytes(progress.total)}` : ""}
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-hover">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${percent}%` }} />
          </span>
        </>
      );
    action = null;
  }

  return (
    <Setting title={`Getman ${version}`} description={description}>
      {action}
    </Setting>
  );
}

function Setting({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-accent" : "bg-line-strong"}`}
    >
      <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}
