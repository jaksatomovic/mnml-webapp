"use client";

/** Slot kinds used in Surface grids; must match backend mode JSON ``supported_slot_types``. */
export const WIDGET_SLOT_TYPES = ["FULL", "SMALL", "WIDE", "TALL"] as const;
export type WidgetSlotType = (typeof WIDGET_SLOT_TYPES)[number];

/** First matching slot in FULL → SMALL → WIDE → TALL order (for resetting UI when the current slot is unsupported). */
export function pickFirstAvailableSlot(supported: string[]): WidgetSlotType {
  const set = new Set(supported.map((s) => String(s).trim().toUpperCase()));
  if (set.has("FULL")) return "FULL";
  for (const o of WIDGET_SLOT_TYPES) {
    if (o === "FULL") continue;
    if (set.has(o)) return o;
  }
  return "FULL";
}

interface WidgetSlotFilterProps {
  value: WidgetSlotType;
  onChange: (v: WidgetSlotType) => void;
  tr: (zh: string, en: string, hr?: string) => string;
  /**
   * When set and non-empty, only those slot types are clickable (must match mode JSON ``supported_slot_types``).
   * When omitted or empty, all four slots are available (legacy / unrestricted modes).
   */
  supportedSlotTypes?: string[] | null;
}

const LABELS: Record<WidgetSlotType, { zh: string; en: string; hr?: string }> = {
  FULL: { zh: "整屏", en: "FULL", hr: "FULL" },
  SMALL: { zh: "小格", en: "SMALL", hr: "SMALL" },
  WIDE: { zh: "横宽", en: "WIDE", hr: "WIDE" },
  TALL: { zh: "竖高", en: "TALL", hr: "TALL" },
};

/** Whether the mode’s ``supported_slot_types`` allows this preview slot. */
export function modeSupportsPreviewSlot(
  supported: string[] | null | undefined,
  slot: WidgetSlotType,
): boolean {
  if (!supported || supported.length === 0) {
    // FULL requires explicit declaration in mode JSON.
    return slot !== "FULL";
  }
  const norm = supported.map((s) => {
    const u = String(s).trim().toUpperCase();
    return u === "LARGE" ? "FULL" : u;
  });
  return norm.includes(slot.toUpperCase());
}

export function WidgetSlotFilter({ value, onChange, tr, supportedSlotTypes }: WidgetSlotFilterProps) {
  return (
    <div
      className="flex w-full min-w-0"
      title={tr("按插槽尺寸筛选小组件", "Filter widgets by slot size", "Filtriraj widgete po veličini slota")}
    >
      {WIDGET_SLOT_TYPES.map((slot, i) => {
        const L = LABELS[slot];
        const allowed = modeSupportsPreviewSlot(supportedSlotTypes, slot);
        return (
          <button
            key={slot}
            type="button"
            disabled={!allowed}
            onClick={() => {
              if (allowed) onChange(slot);
            }}
            className={`flex-1 min-w-0 px-1.5 py-1.5 text-[10px] sm:text-xs font-semibold tracking-wide border border-ink/20 transition-colors ${
              i === 0 ? "rounded-l-lg" : ""
            }${i === WIDGET_SLOT_TYPES.length - 1 ? "rounded-r-lg" : ""}${i > 0 ? " -ml-px" : ""} ${
              !allowed
                ? "bg-white text-ink/35 cursor-not-allowed opacity-60"
                : value === slot
                  ? "bg-ink text-white border-ink z-10 relative"
                  : "bg-white text-ink hover:bg-ink/5"
            }`}
          >
            {tr(L.zh, L.en, L.hr)}
          </button>
        );
      })}
    </div>
  );
}
