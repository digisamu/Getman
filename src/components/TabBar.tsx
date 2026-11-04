import { Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cancelTab, useResponses } from "../store/responses";
import { confirmAction } from "../store/ui";
import { isMac } from "../lib/bridge";
import { useWorkspace } from "../store/workspace";

export function requestCloseTab(tabId: string) {
  const tab = useWorkspace.getState().tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const close = () => {
    cancelTab(tabId);
    useResponses.getState().setState(tabId, undefined);
    useWorkspace.getState().closeTab(tabId);
  };
  // Untouched scratch tabs close silently; anything with unsaved work asks first.
  const hasWork = tab.dirty && (tab.source !== null || tab.request.url.trim() !== "");
  if (!hasWork) return close();
  confirmAction({
    title: "Unsaved changes",
    message: `“${tab.request.name}” has changes that are not saved to a collection. Close it anyway?`,
    confirmLabel: "Close without saving",
    danger: true,
    onConfirm: close
  });
}

/** Request tabs, shown inside the toolbar like Safari's compact tabs. */
export function TabStrip() {
  const tabs = useWorkspace((state) => state.tabs);
  const activeTabId = useWorkspace((state) => state.activeTabId);
  const loading = useResponses((state) => state.byTab);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={strip}
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(event) => {
          if (strip.current && Math.abs(event.deltaY) > Math.abs(event.deltaX)) strip.current.scrollLeft += event.deltaY;
        }}
        role="tablist"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const isLoading = loading[tab.id]?.status === "loading";
          const unsaved = tab.dirty && tab.source !== null;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              data-active={active}
              className="tab no-drag group"
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  requestCloseTab(tab.id);
                }
              }}
              onClick={() => useWorkspace.getState().setActiveTab(tab.id)}
              title={tab.request.url || tab.request.name}
            >
              <span className={`method method-${tab.request.method} shrink-0 text-[10px]`}>{tab.request.method === "DELETE" ? "DEL" : tab.request.method === "OPTIONS" ? "OPT" : tab.request.method}</span>
              <span className={`min-w-0 flex-1 truncate ${tab.source ? "" : "italic"}`}>{tab.request.name}</span>
              <span className="relative grid h-[18px] w-[18px] shrink-0 place-items-center">
                {isLoading ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                ) : (
                  unsaved && <span className="h-1.5 w-1.5 rounded-full bg-muted group-hover:hidden" />
                )}
                <button
                  className={`tab-close ${active && !unsaved && !isLoading ? "" : "opacity-0"} group-hover:opacity-100`}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestCloseTab(tab.id);
                  }}
                  aria-label={`Close ${tab.request.name}`}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <button className="no-drag icon-btn shrink-0" onClick={() => useWorkspace.getState().openNewTab()} title={`New request (${isMac ? "⌘T" : "Ctrl+T"})`}>
        <Plus size={16} />
      </button>
    </div>
  );
}
