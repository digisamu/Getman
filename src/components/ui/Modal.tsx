import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

export function Modal({ title, onClose, children, footer, width = 460 }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fade-in fixed inset-0 z-40 grid place-items-center p-6" style={{ background: "var(--scrim)" }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet pop-in flex max-h-full w-full flex-col overflow-hidden" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-5 pr-3">
          <h2 className="dialog-title text-base font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
