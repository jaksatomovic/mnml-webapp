"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width on the panel (default max-w-lg). */
  maxWidthClassName?: string;
}

export function Dialog({ open, onClose, children, maxWidthClassName = "max-w-lg" }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div className={`relative z-10 w-full animate-fade-in ${maxWidthClassName}`}>
        {children}
      </div>
    </div>
  );
}

export function DialogContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-ink/10 bg-white/95 p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

export function DialogHeader({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1.5 text-ink-light hover:text-ink hover:bg-ink/5 transition-colors"
          aria-label="Close"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-semibold tracking-tight text-ink">{children}</h2>
  );
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-ink-light mt-1.5 leading-relaxed">{children}</p>
  );
}
