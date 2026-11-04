import { Check, ChevronDown, Layers, Palette, Settings2, Wrench } from "lucide-react";
import iconUrl from "../assets/logo.png";
import { isDesktop, isMac } from "../lib/bridge";
import { useUi } from "../store/ui";
import { useActiveEnvironment, useWorkspace } from "../store/workspace";
import type { Theme } from "../types/api";
import { Popover, usePopover } from "./ui/Popover";

export const THEMES: Array<{ id: Theme; label: string; swatch: string[] }> = [
  { id: "postman", label: "Postman", swatch: ["#1c1c1c", "#ff6c37"] },
  { id: "dark", label: "Dark", swatch: ["#0f1217", "#4c8dff"] },
  { id: "light", label: "Light", swatch: ["#ffffff", "#e2531c"] },
  { id: "sydney", label: "Sydney", swatch: ["#fae6ec", "#c2416b", "#b9d6f2"] }
];

function EnvironmentPicker() {
  const environments = useWorkspace((state) => state.environments);
  const active = useActiveEnvironment();
  const menu = usePopover();
  const openDialog = useUi((state) => state.openDialog);

  return (
    <>
      <button className="no-drag btn h-7 max-w-[220px] gap-2 px-2.5 text-xs" onClick={(event) => menu.toggle(event.currentTarget)} title="Active environment">
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
            <span className="flex h-4 w-7 shrink-0 overflow-hidden rounded-sm border border-line">
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

export function TitleBar() {
  const toolsOpen = useUi((state) => state.toolsOpen);
  const setToolsOpen = useUi((state) => state.setToolsOpen);
  const openDialog = useUi((state) => state.openDialog);
  // Leave room for the macOS traffic lights, or for the Windows/Linux caption buttons overlay.
  const padding = isDesktop ? (isMac ? { paddingLeft: 84 } : { paddingRight: 148 }) : undefined;

  return (
    <header className="titlebar drag flex h-11 shrink-0 items-center gap-3 border-b border-line bg-sidebar px-3" style={padding}>
      <div className="flex items-center gap-2">
        <img src={iconUrl} alt="" className="h-6 w-6 object-contain" draggable={false} />
        <span className="wordmark text-[15px] leading-none">Getman</span>
      </div>
      <div className="flex-1" />
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
