"use client";

import type { SurfaceGridSlot } from "@/lib/surface-layout";
import {
  SURFACE_LAYOUT_TEMPLATES,
  TEMPLATE_GRID_COLS,
  TEMPLATE_GRID_ROWS,
  type SurfaceLayoutTemplateId,
} from "@/lib/surface-layout-templates";

function MiniLayoutPreview({ slots }: { slots: SurfaceGridSlot[] }) {
  const cols = TEMPLATE_GRID_COLS;
  const rows = TEMPLATE_GRID_ROWS;
  return (
    <div
      className="aspect-[4/3] w-full rounded-md bg-[#e8e8ea] p-[3px]"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gap: 3,
      }}
    >
      {slots.map((s, i) => (
        <div
          key={`${String(s.id)}-${i}`}
          className="rounded-[3px] bg-[#4a4a4f] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          style={{
            gridColumn: `${Number(s.x ?? 0) + 1} / span ${Number(s.w ?? 1)}`,
            gridRow: `${Number(s.y ?? 0) + 1} / span ${Number(s.h ?? 1)}`,
          }}
        />
      ))}
    </div>
  );
}

export interface SurfaceLayoutTemplatePickerProps {
  /** When null, no card is highlighted (e.g. custom or non-2×2 grid). */
  value: SurfaceLayoutTemplateId | null;
  onChange: (id: SurfaceLayoutTemplateId) => void;
  tr: (zh: string, en: string, hr?: string) => string;
  title?: string;
  hint?: string;
}

export function SurfaceLayoutTemplatePicker({
  value,
  onChange,
  tr,
  title,
  hint,
}: SurfaceLayoutTemplatePickerProps) {
  return (
    <div className="space-y-3">
      {title ? (
        <h3 className="font-serif text-base font-semibold text-ink">{title}</h3>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SURFACE_LAYOUT_TEMPLATES.map((t) => {
          const selected = value !== null && value === t.id;
          const label = tr(t.label.zh, t.label.en, t.label.hr);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`rounded-xl border p-2.5 text-left transition-colors ${
                selected
                  ? "border-ink bg-ink/5 ring-2 ring-ink/25 ring-offset-1"
                  : "border-ink/15 bg-white hover:border-ink/30 hover:bg-paper-dark/50"
              }`}
            >
              <MiniLayoutPreview slots={t.slots} />
              <div className="mt-2 text-center text-[11px] font-medium leading-tight text-ink line-clamp-2">{label}</div>
            </button>
          );
        })}
      </div>
      {hint ? <p className="text-xs text-ink-light leading-relaxed">{hint}</p> : null}
    </div>
  );
}
