import { ChevronRight, Copy, Download, Folder, FolderPlus, MoreHorizontal, PanelLeft, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import iconUrl from "../assets/logo.png";
import { bridge, isDesktop, isMac } from "../lib/bridge";
import { cloneRequest } from "../lib/factory";
import { dayLabel, relativeTime, statusTone } from "../lib/format";
import { exportCollection, importCollection } from "../lib/postman";
import { confirmAction, useUi } from "../store/ui";
import { useWorkspace } from "../store/workspace";
import type { Collection, CollectionFolder, CollectionRequest, HistoryEntry } from "../types/api";
import { MenuList, Popover, usePopover } from "./ui/Popover";

type Editing = { id: string; value: string; commit: (value: string) => void } | null;

export async function importCollectionFromFile() {
  const text = await bridge.openFile({ extensions: ["json"] });
  if (text === null) return;
  try {
    const collection = importCollection(text);
    useWorkspace.getState().importCollection(collection);
    useUi.getState().toast(`Imported “${collection.name}”`);
  } catch (error) {
    useUi.getState().toast(error instanceof Error ? error.message : "Import failed", "danger");
  }
}

export function Sidebar() {
  const view = useUi((state) => state.sidebarView);
  const setView = useUi((state) => state.setSidebarView);
  const [query, setQuery] = useState("");
  const addMenu = usePopover();

  return (
    <aside className="sidebar chrome flex h-full min-w-0 flex-col">
      {/* Full-height sidebar: the macOS traffic lights sit in this row, as in Finder or Notes. */}
      <div className="sidebar-header drag flex h-[52px] shrink-0 items-center gap-2 pr-2" style={{ paddingLeft: isDesktop && isMac ? "max(14px, var(--traffic-lights))" : 14 }}>
        <img src={iconUrl} alt="" className="h-5 w-5 object-contain" draggable={false} />
        <span className="wordmark text-[15px] leading-none">Getman</span>
        <button className="no-drag icon-btn ml-auto" onClick={() => useWorkspace.getState().toggleSidebar()} title={`Hide sidebar (${isMac ? "⌃⌘S" : "Ctrl+B"})`}>
          <PanelLeft size={16} />
        </button>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3">
        <div className="seg">
          <button className="seg-item" data-active={view === "collections"} onClick={() => setView("collections")}>
            Collections
          </button>
          <button className="seg-item" data-active={view === "history"} onClick={() => setView("history")}>
            History
          </button>
        </div>
        {view === "collections" && (
          <>
            <button className="icon-btn" title="New collection or import" onClick={(event) => addMenu.toggle(event.currentTarget)}>
              <Plus size={16} />
            </button>
            <Popover anchor={addMenu.anchor} open={addMenu.open} onClose={addMenu.close} align="end">
              <MenuList
                onClose={addMenu.close}
                items={[
                  { label: "New collection", icon: <FolderPlus size={14} />, onSelect: () => useWorkspace.getState().createCollection() },
                  { label: "Import collection…", icon: <Upload size={14} />, onSelect: () => void importCollectionFromFile() }
                ]}
              />
            </Popover>
          </>
        )}
      </div>

      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input h-7 pl-7 pr-7 text-xs" placeholder={view === "collections" ? "Filter requests" : "Filter history"} value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && (
            <button className="icon-btn absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2" onClick={() => setQuery("")} aria-label="Clear filter">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3">{view === "collections" ? <CollectionTree query={query} /> : <HistoryList query={query} />}</div>
    </aside>
  );
}

function matches(request: { name: string; url: string; method: string }, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return request.name.toLowerCase().includes(needle) || request.url.toLowerCase().includes(needle) || request.method.toLowerCase() === needle;
}

function InlineInput({ editing, onDone }: { editing: NonNullable<Editing>; onDone: () => void }) {
  const [value, setValue] = useState(editing.value);
  const commit = () => {
    if (value.trim()) editing.commit(value.trim());
    onDone();
  };
  return (
    <input
      autoFocus
      className="input h-6 px-1.5 text-sm"
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") onDone();
      }}
    />
  );
}

function RowMenu({ items }: { items: Parameters<typeof MenuList>[0]["items"] }) {
  const menu = usePopover();
  return (
    <>
      <button
        className={`icon-btn h-6 w-6 ${menu.open ? "opacity-100" : "opacity-0 group-hover:opacity-100"} focus-visible:opacity-100`}
        onClick={(event) => {
          event.stopPropagation();
          menu.toggle(event.currentTarget);
        }}
        aria-label="More actions"
      >
        <MoreHorizontal size={14} />
      </button>
      <Popover anchor={menu.anchor} open={menu.open} onClose={menu.close} align="end">
        <MenuList items={items} onClose={menu.close} />
      </Popover>
    </>
  );
}

function TreeRow({
  depth,
  active,
  onClick,
  onDoubleClick,
  children,
  menu
}: {
  depth: number;
  active?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  children: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <div
      role="treeitem"
      tabIndex={0}
      className={`group mx-1.5 flex h-7 items-center gap-1.5 rounded pr-1 text-sm ${active ? "bg-selected text-fg" : "hover:bg-hover"}`}
      style={{ paddingLeft: 6 + depth * 14 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) onClick();
      }}
    >
      {children}
      <div className="ml-auto flex shrink-0 items-center">{menu}</div>
    </div>
  );
}

function CollectionTree({ query }: { query: string }) {
  const collections = useWorkspace((state) => state.collections);
  // Subscribe to the id only, so typing in the active request does not re-render the tree.
  const activeRequestId = useWorkspace((state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.source?.requestId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const store = useWorkspace.getState;

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expand = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  if (collections.length === 0) {
    return (
      <div className="px-4 pt-6 text-center text-sm text-muted">
        <p>Collections keep the requests you reuse.</p>
        <div className="mt-3 flex justify-center gap-2">
          <button className="btn" onClick={() => store().createCollection()}>
            New collection
          </button>
          <button className="btn" onClick={() => void importCollectionFromFile()}>
            Import
          </button>
        </div>
      </div>
    );
  }

  const exportOne = async (collection: Collection) => {
    const saved = await bridge.saveFile({ defaultName: `${collection.name.replace(/[^\w.-]+/g, "_")}.postman_collection.json`, content: exportCollection(collection) });
    if (saved) useUi.getState().toast("Collection exported");
  };

  const renderRequest = (collection: Collection, folder: CollectionFolder, request: CollectionRequest) => {
    const source = { collectionId: collection.id, folderId: folder.id, requestId: request.id };
    const isEditing = editing?.id === request.id;
    return (
      <TreeRow
        key={request.id}
        depth={2}
        active={activeRequestId === request.id}
        onClick={() => store().openRequest(source)}
        onDoubleClick={() => setEditing({ id: request.id, value: request.name, commit: (name) => store().renameRequest(source, name) })}
        menu={
          !isEditing && (
            <RowMenu
              items={[
                { label: "Rename", icon: <Pencil size={13} />, onSelect: () => setEditing({ id: request.id, value: request.name, commit: (name) => store().renameRequest(source, name) }) },
                { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => store().duplicateRequest(source) },
                "separator",
                {
                  label: "Delete",
                  icon: <Trash2 size={13} />,
                  danger: true,
                  onSelect: () =>
                    confirmAction({ title: "Delete request", message: `Delete “${request.name}”? This cannot be undone.`, confirmLabel: "Delete", danger: true, onConfirm: () => store().deleteRequest(source) })
                }
              ]}
            />
          )
        }
      >
        <span className={`method method-${request.method} w-11 shrink-0 text-right text-[10px]`}>{request.method === "DELETE" ? "DEL" : request.method === "OPTIONS" ? "OPT" : request.method}</span>
        {isEditing ? <InlineInput editing={editing!} onDone={() => setEditing(null)} /> : <span className="truncate">{request.name}</span>}
      </TreeRow>
    );
  };

  let anyMatch = false;
  const tree = collections.map((collection) => {
    const folders = collection.folders
      .map((folder) => ({ folder, requests: folder.requests.filter((request) => matches(request, query)) }))
      .filter(({ folder, requests }) => !query || requests.length > 0 || folder.name.toLowerCase().includes(query.toLowerCase()));
    if (query && folders.length === 0) return null;
    anyMatch = true;
    const open = query !== "" || !collapsed.has(collection.id);
    const isEditing = editing?.id === collection.id;
    const rename = () => setEditing({ id: collection.id, value: collection.name, commit: (name) => store().renameCollection(collection.id, name) });

    return (
      <Fragment key={collection.id}>
        <TreeRow
          depth={0}
          onClick={() => toggle(collection.id)}
          onDoubleClick={rename}
          menu={
            !isEditing && (
              <RowMenu
                items={[
                  {
                    label: "Add folder",
                    icon: <FolderPlus size={13} />,
                    onSelect: () => {
                      const folderId = store().addFolder(collection.id);
                      expand(collection.id);
                      setEditing({ id: folderId, value: "New folder", commit: (name) => store().renameFolder(collection.id, folderId, name) });
                    }
                  },
                  { label: "Rename", icon: <Pencil size={13} />, onSelect: rename },
                  { label: "Export as Postman v2.1", icon: <Download size={13} />, onSelect: () => void exportOne(collection) },
                  "separator",
                  {
                    label: "Delete",
                    icon: <Trash2 size={13} />,
                    danger: true,
                    onSelect: () =>
                      confirmAction({
                        title: "Delete collection",
                        message: `Delete “${collection.name}” and all ${collection.folders.reduce((sum, f) => sum + f.requests.length, 0)} requests in it? This cannot be undone.`,
                        confirmLabel: "Delete collection",
                        danger: true,
                        onConfirm: () => store().deleteCollection(collection.id)
                      })
                  }
                ]}
              />
            )
          }
        >
          <ChevronRight size={14} className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
          {isEditing ? <InlineInput editing={editing!} onDone={() => setEditing(null)} /> : <span className="truncate font-medium">{collection.name}</span>}
        </TreeRow>

        {open &&
          folders.map(({ folder, requests }) => {
            const folderOpen = query !== "" || !collapsed.has(folder.id);
            const folderEditing = editing?.id === folder.id;
            const renameFolder = () => setEditing({ id: folder.id, value: folder.name, commit: (name) => store().renameFolder(collection.id, folder.id, name) });
            return (
              <Fragment key={folder.id}>
                <TreeRow
                  depth={1}
                  onClick={() => toggle(folder.id)}
                  onDoubleClick={renameFolder}
                  menu={
                    !folderEditing && (
                      <RowMenu
                        items={[
                          {
                            label: "Add request",
                            icon: <Plus size={13} />,
                            onSelect: () => {
                              expand(folder.id);
                              store().openRequest(store().createRequestIn(collection.id, folder.id));
                            }
                          },
                          { label: "Rename", icon: <Pencil size={13} />, onSelect: renameFolder },
                          "separator",
                          {
                            label: "Delete",
                            icon: <Trash2 size={13} />,
                            danger: true,
                            onSelect: () =>
                              confirmAction({
                                title: "Delete folder",
                                message: `Delete “${folder.name}” and its ${folder.requests.length} requests? This cannot be undone.`,
                                confirmLabel: "Delete folder",
                                danger: true,
                                onConfirm: () => store().deleteFolder(collection.id, folder.id)
                              })
                          }
                        ]}
                      />
                    )
                  }
                >
                  <ChevronRight size={14} className={`shrink-0 text-faint transition-transform ${folderOpen ? "rotate-90" : ""}`} />
                  <Folder size={14} className="shrink-0 text-muted" />
                  {folderEditing ? <InlineInput editing={editing!} onDone={() => setEditing(null)} /> : <span className="truncate">{folder.name}</span>}
                </TreeRow>
                {folderOpen && requests.map((request) => renderRequest(collection, folder, request))}
                {folderOpen && !query && folder.requests.length === 0 && (
                  <div className="py-1 text-xs text-faint" style={{ paddingLeft: 6 + 2 * 14 + 12 }}>
                    Empty folder
                  </div>
                )}
              </Fragment>
            );
          })}
        {open && !query && collection.folders.length === 0 && (
          <div className="py-1 text-xs text-faint" style={{ paddingLeft: 34 }}>
            No folders yet
          </div>
        )}
      </Fragment>
    );
  });

  return <div role="tree">{anyMatch ? tree : <p className="px-4 pt-4 text-sm text-muted">No requests match “{query}”.</p>}</div>;
}

function HistoryList({ query }: { query: string }) {
  const history = useWorkspace((state) => state.history);
  const filtered = useMemo(() => history.filter((entry) => matches(entry.request, query)), [history, query]);
  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    filtered.forEach((entry) => {
      const label = dayLabel(entry.timestamp);
      map.set(label, [...(map.get(label) ?? []), entry]);
    });
    return [...map.entries()];
  }, [filtered]);

  if (history.length === 0) return <p className="px-4 pt-4 text-sm text-muted">Requests you send are listed here.</p>;
  if (filtered.length === 0) return <p className="px-4 pt-4 text-sm text-muted">Nothing in history matches “{query}”.</p>;

  return (
    <div>
      {groups.map(([label, entries], index) => (
        <section key={label}>
          <div className="flex h-7 items-center justify-between px-3 text-xs font-medium text-faint">
            <span>{label}</span>
            {index === 0 && (
              <button
                className="btn-ghost h-6 px-1.5 text-xs"
                onClick={() =>
                  confirmAction({ title: "Clear history", message: "Remove all requests from history?", confirmLabel: "Clear history", danger: true, onConfirm: () => useWorkspace.getState().clearHistory() })
                }
              >
                Clear
              </button>
            )}
          </div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className="group mx-1.5 flex h-[42px] cursor-default items-center gap-2 rounded px-2 hover:bg-hover"
              onClick={() => useWorkspace.getState().openNewTab(cloneRequest(entry.request))}
              title={entry.request.url}
            >
              <span className={`method method-${entry.request.method} w-11 shrink-0 text-right text-[10px]`}>
                {entry.request.method === "DELETE" ? "DEL" : entry.request.method === "OPTIONS" ? "OPT" : entry.request.method}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{entry.request.url || "(no URL)"}</div>
                <div className="flex gap-2 text-2xs text-faint">
                  {entry.status !== null ? <span className={`font-mono tone-${statusTone(entry.status)}`}>{entry.status}</span> : <span className="tone-danger">Failed</span>}
                  {entry.timeMs !== null && <span className="font-mono">{entry.timeMs} ms</span>}
                  <span>{relativeTime(entry.timestamp)}</span>
                </div>
              </div>
              <button
                className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100"
                title="Remove from history"
                onClick={(event) => {
                  event.stopPropagation();
                  useWorkspace.getState().deleteHistoryEntry(entry.id);
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
