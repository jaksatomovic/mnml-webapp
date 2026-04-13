/**
 * Eight predefined 2×2 grid topologies (empty mode slots).
 * Matches common dashboard / playlist layout patterns.
 */
import type { SurfaceGridSlot } from "@/lib/surface-layout";

export type SurfaceLayoutTemplateId =
  | "layout_1"
  | "layout_2"
  | "layout_3"
  | "layout_4"
  | "layout_5"
  | "layout_6"
  | "layout_7"
  | "layout_8";

export type SurfaceLayoutTemplateMeta = {
  id: SurfaceLayoutTemplateId;
  /** i18n keys passed through tr() on the client */
  label: { zh: string; en: string; hr: string };
  slots: SurfaceGridSlot[];
};

/** Logical grid for all templates: 2 columns × 2 rows. */
export const TEMPLATE_GRID_COLS = 2;
export const TEMPLATE_GRID_ROWS = 2;

export const SURFACE_LAYOUT_TEMPLATES: SurfaceLayoutTemplateMeta[] = [
  {
    id: "layout_1",
    label: { zh: "整屏", en: "Full", hr: "Cijeli ekran" },
    slots: [{ id: "full", x: 0, y: 0, w: 2, h: 2, slot_type: "LARGE" }],
  },
  {
    id: "layout_2",
    label: { zh: "左栏 + 右两格", en: "Left bar + 2 right", hr: "Lijevo + 2 desno" },
    slots: [
      { id: "left", x: 0, y: 0, w: 1, h: 2, slot_type: "TALL" },
      { id: "rt", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL" },
      { id: "rb", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL" },
    ],
  },
  {
    id: "layout_3",
    label: { zh: "顶栏 + 下两格", en: "Top bar + 2 bottom", hr: "Gore + 2 dolje" },
    slots: [
      { id: "top", x: 0, y: 0, w: 2, h: 1, slot_type: "WIDE" },
      { id: "bl", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL" },
      { id: "br", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL" },
    ],
  },
  {
    id: "layout_4",
    label: { zh: "上下两分", en: "Two rows", hr: "Dva reda" },
    slots: [
      { id: "row0", x: 0, y: 0, w: 2, h: 1, slot_type: "WIDE" },
      { id: "row1", x: 0, y: 1, w: 2, h: 1, slot_type: "WIDE" },
    ],
  },
  {
    id: "layout_5",
    label: { zh: "左右两分", en: "Two columns", hr: "Dva stupca" },
    slots: [
      { id: "c0", x: 0, y: 0, w: 1, h: 2, slot_type: "TALL" },
      { id: "c1", x: 1, y: 0, w: 1, h: 2, slot_type: "TALL" },
    ],
  },
  {
    id: "layout_6",
    label: { zh: "左两格 + 右栏", en: "2 left + right bar", hr: "2 lijevo + desno" },
    slots: [
      { id: "lt", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL" },
      { id: "lb", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL" },
      { id: "right", x: 1, y: 0, w: 1, h: 2, slot_type: "TALL" },
    ],
  },
  {
    id: "layout_7",
    label: { zh: "上两格 + 底栏", en: "2 top + bottom", hr: "2 gore + dno" },
    slots: [
      { id: "tl", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL" },
      { id: "tr", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL" },
      { id: "bot", x: 0, y: 1, w: 2, h: 1, slot_type: "WIDE" },
    ],
  },
  {
    id: "layout_8",
    label: { zh: "四宫格", en: "2×2 grid", hr: "2×2 mreža" },
    slots: [
      { id: "a", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL" },
      { id: "b", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL" },
      { id: "c", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL" },
      { id: "d", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL" },
    ],
  },
];

export function getSurfaceLayoutTemplate(id: SurfaceLayoutTemplateId): SurfaceLayoutTemplateMeta | undefined {
  return SURFACE_LAYOUT_TEMPLATES.find((t) => t.id === id);
}

export function cloneTemplateSlots(template: SurfaceLayoutTemplateMeta): SurfaceGridSlot[] {
  return template.slots.map((s) => ({ ...s }));
}

/** Compare slot geometry only (ignores id); used to highlight the active 2×2 template. */
function slotGeomKey(s: SurfaceGridSlot): string {
  return [Number(s.x) || 0, Number(s.y) || 0, Number(s.w) || 1, Number(s.h) || 1].join(",");
}

export function matchSurfaceLayoutTemplate(
  slots: SurfaceGridSlot[],
  cols: number,
  rows: number,
): SurfaceLayoutTemplateId | null {
  if (cols !== TEMPLATE_GRID_COLS || rows !== TEMPLATE_GRID_ROWS || !slots.length) return null;
  const sig = [...slots].map(slotGeomKey).sort().join(";");
  for (const t of SURFACE_LAYOUT_TEMPLATES) {
    const tsig = [...t.slots].map(slotGeomKey).sort().join(";");
    if (sig === tsig) return t.id;
  }
  return null;
}
