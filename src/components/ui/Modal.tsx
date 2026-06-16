import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  maxWidth?: string;
}

export function Modal({ open, onClose, children, title, maxWidth = "max-w-md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in-up"
      style={{ background: 'rgba(10, 15, 20, 0.8)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`w-full ${maxWidth} mx-4 rounded-2xl shadow-glass-lg animate-scale-in overflow-hidden`}
        style={{ background: '#0F1A20', border: '1px solid #1A2E35' }}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1A2E35' }}>
            <h2 className="text-base font-semibold" style={{ color: '#E8F4F0' }}>{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-neutral-700/50"
            >
              <X className="w-4 h-4" style={{ color: '#5C8D8A' }} />
            </button>
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
