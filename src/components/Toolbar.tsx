import { Check, ChevronDown, Layers, PanelLeft, Palette, Settings2, Wrench } from "lucide-react";
import { isDesktop, isMac } from "../lib/bridge";
import type { AppearanceRequest } from "../shared/ipc";
import { useUi } from "../store/ui";
import { useActiveEnvironment, useWorkspace } from "../store/workspace";
import type { Theme } from "../types/api";
import { TabStrip } from "./TabBar";
import { Popover, usePopover } from "./ui/Popover";

export const THEMES: Array<{ id: Theme; label: string; swatch: string[] }> = [
  { id: "system", label: "System", swatch: ["#f5f5f7", "#2a2a2c", "#0a84ff"] },
  { id: "postman", label: "Postman", swatch: ["#1c1c1c", "#ff6c37"] },
  { id: "dark", label: "Dark", swatch: ["#0f1217", "#4c8dff"] },
  { id: "light", label: "Light", swatch: ["#ffffff", "#e2531c"] },
  { id: "sydney", label: "Sydney", swatch: ["#fae6ec", "#c2416b", "#b9d6f2"] }
];

/** Which native appearance (menus, dialogs, glass) goes with each theme. */
export const THEME_MODES: Record<Theme, AppearanceRequest["mode"]> = { system: "system", postman: "dark", dark: "dark", light: "light", sydney: "light" };

function EnvironmentPicker() {
  const environments = useWorkspace((state) => state.environments);
  const active = useActiveEnvironment();
  const menu = usePopover();
  const openDialog = useUi((state) => state.openDialog);

  return (
    <>
      <button className="no-drag btn max-w-[200px] gap-2 px-2.5 text-xs" onClick={(event) => menu.toggle(event.currentTarget)} title="Active environment">
        <Layers size={13} className={active ? "text-accent" : "text-faint"} />
        <span className={`truncate ${active ? "" : "text-muted"}`}>{active?.name ?? "No environment"}</span>
        <ChevronDown size={13} className="text-faint" />
      </button>
      <Popover anchor={menu.anchor} open={menu.open} onClose={menu.close} align="end" className="menu w-60">
        {[{ id: null, name: "No environment" }, ...environments].map((env) => (
          <button
            key={env.id ?? "none"}
            className="menu-item"
            onClick={() => {
              menu.close();
              useWorkspace.getState().setActiveEnvironment(env.id);
            }}
          >
            <span className="grid w-4 place-items-center text-accent">{(active?.id ?? null) === env.id && <Check size={14} />}</span>
            <span className={`flex-1 truncate ${env.id ? "" : "text-muted"}`}>{env.name}</span>
          </button>
        ))}
        <div className="menu-sep" />
        <button
          className="menu-item"
          onClick={() => {
            menu.close();
            openDialog({ kind: "environments", environmentId: active?.id });
          }}
        >
          <span className="w-4" />
          Manage environments…
        </button>
      </Popover>
    </>
  );
}

function ThemePicker() {
  const theme = useWorkspace((state) => state.theme);
  const menu = usePopover();
  return (
    <>
      <button className="no-drag icon-btn" onClick={(event) => menu.toggle(event.currentTarget)} title="Theme" aria-label="Theme">
        <Palette size={15} />
      </button>
      <Popover anchor={menu.anchor} open={menu.open} onClose={menu.close} align="end" className="menu w-48">
        {THEMES.map((item) => (
          <button
            key={item.id}
            className="menu-item"
            onClick={() => {
              menu.close();
              useWorkspace.getState().setTheme(item.id);
            }}
          >
            <span className="flex h-4 w-7 shrink-0 overflow-hidden rounded-[4px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.25)]">
              {item.swatch.map((color) => (
                <span key={color} className="flex-1" style={{ background: color }} />
              ))}
            </span>
            <span className="flex-1">{item.label}</span>
            {theme === item.id && <Check size={14} className="text-accent" />}
          </button>
        ))}
      </Popover>
    </>
  );
}

export function Toolbar() {
  const toolsOpen = useUi((state) => state.toolsOpen);
  const setToolsOpen = useUi((state) => state.setToolsOpen);
  const openDialog = useUi((state) => state.openDialog);
  const sidebarHidden = useWorkspace((state) => state.sidebarHidden);
  // With the sidebar hidden the traffic lights sit over the toolbar; on Windows the caption buttons do.
  const style = {
    paddingLeft: isDesktop && isMac && sidebarHidden ? 84 : 10,
    paddingRight: isDesktop && !isMac ? 150 : 10
  };

  return (
    <header className="toolbar chrome drag flex h-[52px] shrink-0 items-center gap-2 border-b border-line" style={style}>
      {sidebarHidden && (
        <button className="no-drag icon-btn" onClick={() => useWorkspace.getState().toggleSidebar()} title={`Show sidebar (${isMac ? "⌃⌘S" : "Ctrl+B"})`}>
          <PanelLeft size={16} />
        </button>
      )}
      <TabStrip />
      <EnvironmentPicker />
      <div className="no-drag flex items-center gap-0.5">
        <ThemePicker />
        <button className={`icon-btn ${toolsOpen ? "bg-selected text-fg" : ""}`} onClick={() => setToolsOpen(!toolsOpen)} title="Developer tools" aria-pressed={toolsOpen}>
          <Wrench size={15} />
        </button>
        <button className="icon-btn" onClick={() => openDialog({ kind: "settings" })} title="Settings">
          <Settings2 size={15} />
        </button>
      </div>
    </header>
  );
}
