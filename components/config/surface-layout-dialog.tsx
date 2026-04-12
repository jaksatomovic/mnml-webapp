"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Move, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  type GridSpec,
  type SurfaceGridSlot,
  MAX_SURFACE_SLOTS,
  buildGridSpec,
  buildLayoutFromSlots,
  clientPointToGridCell,
  findValidPosition,
  deriveExpectedSlotType,
  mergeSlotModesFromBase,
  modeSupportsSlotTypeLiteral,
  normalizeSurfaceGridSpec,
  sortSurfaceSlotsReadingOrder,
  spanForSlotType,
  SURFACE_GRID_GAP_PX,
  SURFACE_GRID_PADDING_PX,
  validateLayout,
  validateSurfaceSlots,
  SURFACE_SLOT_TYPES,
} from "@/lib/surface-layout";

const DND_SLOT_ID = "application/x-inksight-surface-slot-id";

export type SurfaceLayoutPresetId = "morning" | "work" | "home" | "grid2x2" | "grid3x2";

const PRESETS: Record<
  SurfaceLayoutPresetId,
  { grid: GridSpec; slots: SurfaceGridSlot[] }
> = {
  morning: {
    grid: buildGridSpec(2, 2),
    slots: [
      { id: "top_left", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "top_right", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "bottom", x: 0, y: 1, w: 2, h: 1, slot_type: "WIDE", mode_id: "STOIC" },
    ],
  },
  work: {
    grid: buildGridSpec(2, 2),
    slots: [
      { id: "top_wide", x: 0, y: 0, w: 2, h: 1, slot_type: "WIDE", mode_id: "STOIC" },
      { id: "bottom_left", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "bottom_right", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
    ],
  },
  home: {
    grid: buildGridSpec(2, 2),
    slots: [
      { id: "left_tall", x: 0, y: 0, w: 1, h: 2, slot_type: "TALL", mode_id: "STOIC" },
      { id: "right_top", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "right_bottom", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
    ],
  },
  grid2x2: {
    grid: buildGridSpec(2, 2),
    slots: [
      { id: "a", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "b", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "c", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "d", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
    ],
  },
  grid3x2: {
    grid: buildGridSpec(3, 2),
    slots: [
      { id: "a", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "b", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "c", x: 2, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "d", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "e", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      { id: "f", x: 2, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
    ],
  },
};

function cloneSlots(slots: SurfaceGridSlot[]): SurfaceGridSlot[] {
  return slots.map((s) => ({ ...s }));
}

export type SurfaceLayoutCatalogItem = {
  mode_id: string;
  supported_slot_types?: string[];
  display_name?: string;
};

export interface SurfaceLayoutDialogProps {
  open: boolean;
  onClose: () => void;
  surfaceId: string;
  /** Merged definition from catalog (grid + slots + layout + refresh …) */
  baseDefinition: Record<string, unknown> | null;
  /** Mode catalog entries (with optional ``supported_slot_types``) for compatibility filtering */
  catalogItems?: SurfaceLayoutCatalogItem[];
  tr: (zh: string, en: string, hr?: string) => string;
  onApply: (payload: { grid: GridSpec; slots: SurfaceGridSlot[]; layout: Array<Record<string, unknown>> }) => void;
}

export function SurfaceLayoutDialog({
  open,
  onClose,
  surfaceId,
  baseDefinition,
  catalogItems,
  tr,
  onApply,
}: SurfaceLayoutDialogProps) {
  const [grid, setGrid] = useState<GridSpec>(() => buildGridSpec(2, 2));
  const [slots, setSlots] = useState<SurfaceGridSlot[]>([]);
  const [slotMutationBlocked, setSlotMutationBlocked] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [addSlotType, setAddSlotType] = useState<string>("SMALL");
  const [drawPreview, setDrawPreview] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [resizingSlotId, setResizingSlotId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drawSessionRef = useRef<{ c0: number; r0: number; c1: number; r1: number } | null>(null);
  const skipGridDeselectRef = useRef(false);

  const syncFromBase = useCallback(() => {
    const g = baseDefinition?.grid as Partial<GridSpec> | undefined;
    const sl = Array.isArray(baseDefinition?.slots) ? (baseDefinition?.slots as SurfaceGridSlot[]) : [];
    setGrid(normalizeSurfaceGridSpec(g));
    setSlotMutationBlocked(null);
    setSelectedSlotId(null);
    setSlots(sl.length ? cloneSlots(sl) : cloneSlots(PRESETS.grid2x2.slots));
  }, [baseDefinition]);

  useEffect(() => {
    if (open) syncFromBase();
  }, [open, syncFromBase]);

  const validation = useMemo(
    () => validateLayout({ grid, slots }, catalogItems?.length ? catalogItems : null),
    [slots, grid, catalogItems],
  );

  const invalidSlotIds = useMemo(
    () => new Set(validation.errors.map((e) => e.slot_id).filter(Boolean) as string[]),
    [validation.errors],
  );

  const previewSlots = useMemo(() => sortSurfaceSlotsReadingOrder(slots), [slots]);

  const selectedSlot = useMemo(
    () => (selectedSlotId ? slots.find((s) => String(s.id) === selectedSlotId) : undefined),
    [slots, selectedSlotId],
  );

  const compatibleModesForSelected = useMemo(() => {
    if (!catalogItems?.length) return [];
    const base = catalogItems.filter((it) => it.mode_id.toUpperCase() !== "MY_ADAPTIVE");
    if (!selectedSlot) return base;
    const w = Math.trunc(Number(selectedSlot.w ?? 1));
    const h = Math.trunc(Number(selectedSlot.h ?? 1));
    const expected = deriveExpectedSlotType(w, h, grid.columns, grid.rows);
    return base.filter((it) => modeSupportsSlotTypeLiteral(it.supported_slot_types, expected));
  }, [catalogItems, selectedSlot, grid.columns, grid.rows]);

  const applyPreset = (id: SurfaceLayoutPresetId) => {
    const p = PRESETS[id];
    setGrid(buildGridSpec(p.grid.columns, p.grid.rows));
    setSlots(cloneSlots(p.slots));
    setSlotMutationBlocked(null);
    setSelectedSlotId(null);
  };

  const trySetGridDimensions = useCallback(
    (cols: number, rows: number) => {
      const ng = buildGridSpec(cols, rows);
      const v = validateLayout({ grid: ng, slots }, catalogItems?.length ? catalogItems : null);
      if (!v.valid) {
        setSlotMutationBlocked(
          tr(
            "无法调整网格：槽位会超出边界或与已选模式不兼容。",
            "Cannot change grid: slots would be out of bounds or modes would be incompatible.",
            "Ne može se promijeniti mreža: slotovi ili modovi nisu kompatibilni.",
          ),
        );
        return;
      }
      setSlotMutationBlocked(null);
      setGrid(ng);
    },
    [slots, catalogItems, tr],
  );

  const patchSlot = useCallback(
    (slotId: string, patch: Partial<SurfaceGridSlot>) => {
      setSlotMutationBlocked(null);
      setSlots((prev) => {
        const index = prev.findIndex((s) => String(s.id) === slotId);
        if (index < 0) return prev;
        const next = prev.map((s) => ({ ...s }));
        const merged = { ...next[index], ...patch };

        const geometryKeys = ["slot_type", "x", "y", "w", "h"] as const;
        const touchesGeometry = geometryKeys.some((k) => k in patch);

        if (!touchesGeometry) {
          next[index] = merged;
          return next;
        }

        const st = String(patch.slot_type !== undefined ? patch.slot_type : merged.slot_type || "SMALL").toUpperCase();

        if ("w" in patch || "h" in patch) {
          merged.w = Math.max(1, Math.trunc(Number(patch.w !== undefined ? patch.w : merged.w ?? 1)));
          merged.h = Math.max(1, Math.trunc(Number(patch.h !== undefined ? patch.h : merged.h ?? 1)));
        }

        if (!("w" in patch) && !("h" in patch)) {
          if (st === "FULL") {
            merged.w = grid.columns;
            merged.h = grid.rows;
          } else if (st === "CUSTOM") {
            merged.w = Math.max(1, Math.trunc(Number(merged.w ?? 1)));
            merged.h = Math.max(1, Math.trunc(Number(merged.h ?? 1)));
          } else {
            const [dw, dh] = spanForSlotType(st, grid.columns, grid.rows);
            merged.w = dw;
            merged.h = dh;
          }
        }

        const x = patch.x !== undefined ? Math.trunc(Number(patch.x)) : Math.trunc(Number(merged.x ?? 0));
        const y = patch.y !== undefined ? Math.trunc(Number(patch.y)) : Math.trunc(Number(merged.y ?? 0));
        merged.x = x;
        merged.y = y;

        merged.slot_type = deriveExpectedSlotType(
          Math.trunc(Number(merged.w ?? 1)),
          Math.trunc(Number(merged.h ?? 1)),
          grid.columns,
          grid.rows,
        );

        next[index] = merged;
        const dw = Math.trunc(Number(merged.w ?? 1));
        const dh = Math.trunc(Number(merged.h ?? 1));
        if (validateSurfaceSlots(next, grid.columns, grid.rows).ok) {
          return next;
        }
        const pos = findValidPosition(next, index, grid.columns, grid.rows, dw, dh, { x, y });
        if (pos) {
          next[index] = { ...merged, x: pos.x, y: pos.y };
          if (validateSurfaceSlots(next, grid.columns, grid.rows).ok) return next;
        }
        const msg = tr(
          "无法放置：与其他槽重叠或超出网格。",
          "Cannot place: overlaps another slot or is outside the grid.",
          "Ne može se postaviti: preklapanje ili izvan mreže.",
        );
        queueMicrotask(() => setSlotMutationBlocked(msg));
        return prev;
      });
    },
    [grid.columns, grid.rows, tr],
  );

  const addSlotOfType = (slotType: string) => {
    if (slots.length >= MAX_SURFACE_SLOTS) {
      setSlotMutationBlocked(
        tr("最多 6 个槽位。", "At most 6 slots.", "Najviše 6 slotova."),
      );
      return;
    }
    const stIn = slotType.toUpperCase();
    const [w, h] = spanForSlotType(stIn, grid.columns, grid.rows);
    const st = deriveExpectedSlotType(w, h, grid.columns, grid.rows);
    setSlotMutationBlocked(null);
    setSlots((prev) => {
      if (prev.length >= MAX_SURFACE_SLOTS) return prev;
      const id = `slot_${Date.now().toString(36)}`;
      const draft: SurfaceGridSlot = {
        id,
        x: 0,
        y: 0,
        w,
        h,
        slot_type: st,
        mode_id: "STOIC",
      };
      const combined = [...prev, draft];
      const pos = findValidPosition(combined, combined.length - 1, grid.columns, grid.rows, w, h, { x: 0, y: 0 });
      if (!pos) {
        const msg = tr(
          "没有空间放置该尺寸的组件。",
          "No room for a widget of this size.",
          "Nema mjesta za ovu veličinu widgeta.",
        );
        queueMicrotask(() => setSlotMutationBlocked(msg));
        return prev;
      }
      draft.x = pos.x;
      draft.y = pos.y;
      queueMicrotask(() => {
        skipGridDeselectRef.current = true;
        setSelectedSlotId(id);
      });
      return [...prev, draft];
    });
  };

  const removeSlotById = (slotId: string) => {
    setSlotMutationBlocked(null);
    setSlots((prev) => prev.filter((s) => String(s.id) !== slotId));
    setSelectedSlotId((cur) => (cur === slotId ? null : cur));
  };

  const duplicateSlot = (source: SurfaceGridSlot) => {
    if (slots.length >= MAX_SURFACE_SLOTS) {
      setSlotMutationBlocked(tr("最多 6 个槽位。", "At most 6 slots.", "Najviše 6 slotova."));
      return;
    }
    const w = Math.max(1, Math.trunc(Number(source.w ?? 1)));
    const h = Math.max(1, Math.trunc(Number(source.h ?? 1)));
    const st = deriveExpectedSlotType(w, h, grid.columns, grid.rows);
    const id = `slot_${Date.now().toString(36)}`;
    const modeKeep = String(source.mode_id || source.mode || "STOIC").toUpperCase();
    setSlotMutationBlocked(null);
    setSlots((prev) => {
      if (prev.length >= MAX_SURFACE_SLOTS) return prev;
      const draft: SurfaceGridSlot = {
        ...source,
        id,
        w,
        h,
        slot_type: st,
        mode_id: modeKeep,
        x: 0,
        y: 0,
      };
      const combined = [...prev, draft];
      const pos = findValidPosition(combined, combined.length - 1, grid.columns, grid.rows, w, h, { x: 0, y: 0 });
      if (!pos) {
        queueMicrotask(() =>
          setSlotMutationBlocked(
            tr("无法复制：没有空位。", "Cannot duplicate: no empty space.", "Nema praznog mjesta."),
          ),
        );
        return prev;
      }
      draft.x = pos.x;
      draft.y = pos.y;
      queueMicrotask(() => {
        skipGridDeselectRef.current = true;
        setSelectedSlotId(id);
      });
      return [...prev, { ...draft }];
    });
  };

  const handleApply = () => {
    if (!validation.valid || !baseDefinition) return;
    const mergedSlots = mergeSlotModesFromBase(slots, baseDefinition);
    const ordered = sortSurfaceSlotsReadingOrder(mergedSlots);
    const layout = buildLayoutFromSlots(
      ordered,
      Array.isArray(baseDefinition.layout) ? (baseDefinition.layout as Array<Record<string, unknown>>) : [],
    );
    onApply({
      grid: buildGridSpec(grid.columns, grid.rows),
      slots: ordered,
      layout,
    });
    onClose();
  };

  const onGridDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onGridDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const slotId = e.dataTransfer.getData(DND_SLOT_ID) || e.dataTransfer.getData("text/plain");
    if (!slotId || !gridRef.current) {
      setDraggingSlotId(null);
      return;
    }
    const rect = gridRef.current.getBoundingClientRect();
    const cell = clientPointToGridCell(
      e.clientX,
      e.clientY,
      rect,
      grid.columns,
      grid.rows,
      SURFACE_GRID_PADDING_PX,
      SURFACE_GRID_GAP_PX,
    );
    setDraggingSlotId(null);
    if (!cell) return;
    patchSlot(slotId, { x: cell.col, y: cell.row });
  };

  const onSlotDragStart = (e: React.DragEvent, slotId: string) => {
    e.dataTransfer.setData(DND_SLOT_ID, slotId);
    e.dataTransfer.setData("text/plain", slotId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingSlotId(slotId);
  };

  const onSlotDragEnd = () => setDraggingSlotId(null);

  const commitDrawRect = useCallback(
    (c0: number, r0: number, c1: number, r1: number) => {
      const x = Math.min(c0, c1);
      const y = Math.min(r0, r1);
      const w = Math.abs(c1 - c0) + 1;
      const h = Math.abs(r1 - r0) + 1;
      const st = deriveExpectedSlotType(w, h, grid.columns, grid.rows);
      const id = `slot_${Date.now().toString(36)}`;
      const draft: SurfaceGridSlot = { id, x, y, w, h, slot_type: st, mode_id: "STOIC" };
      setSlots((prev) => {
        if (prev.length >= MAX_SURFACE_SLOTS) {
          queueMicrotask(() =>
            setSlotMutationBlocked(tr("最多 6 个槽位。", "At most 6 slots.", "Najviše 6 slotova.")),
          );
          return prev;
        }
        const next = [...prev, draft];
        if (!validateSurfaceSlots(next, grid.columns, grid.rows).ok) {
          queueMicrotask(() =>
            setSlotMutationBlocked(
              tr("无法添加：重叠或超出网格。", "Cannot add: overlaps or out of bounds.", "Ne može dodati."),
            ),
          );
          return prev;
        }
        queueMicrotask(() => {
          skipGridDeselectRef.current = true;
          setSelectedSlotId(id);
        });
        return next;
      });
    },
    [grid.columns, grid.rows, tr],
  );

  const onCellPointerDown = useCallback(
    (e: React.PointerEvent, col: number, row: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (slots.length >= MAX_SURFACE_SLOTS) {
        setSlotMutationBlocked(tr("最多 6 个槽位。", "At most 6 slots.", "Najviše 6 slotova."));
        return;
      }
      const move = (ev: PointerEvent) => {
        const rect = gridRef.current?.getBoundingClientRect();
        if (!rect || !drawSessionRef.current) return;
        const cell = clientPointToGridCell(
          ev.clientX,
          ev.clientY,
          rect,
          grid.columns,
          grid.rows,
          SURFACE_GRID_PADDING_PX,
          SURFACE_GRID_GAP_PX,
        );
        if (!cell) return;
        const d = drawSessionRef.current;
        d.c1 = cell.col;
        d.r1 = cell.row;
        const x = Math.min(d.c0, d.c1);
        const y = Math.min(d.r0, d.r1);
        const w = Math.abs(d.c1 - d.c0) + 1;
        const h = Math.abs(d.r1 - d.r0) + 1;
        setDrawPreview({ x, y, w, h });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const d = drawSessionRef.current;
        drawSessionRef.current = null;
        setDrawPreview(null);
        if (!d) return;
        commitDrawRect(d.c0, d.r0, d.c1, d.r1);
      };
      drawSessionRef.current = { c0: col, r0: row, c1: col, r1: row };
      setDrawPreview({ x: col, y: row, w: 1, h: 1 });
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [slots.length, grid.columns, grid.rows, commitDrawRect, tr],
  );

  useEffect(() => {
    if (!resizingSlotId) return;
    const slot = slots.find((s) => String(s.id) === resizingSlotId);
    if (!slot) {
      setResizingSlotId(null);
      return;
    }
    const ox = Math.trunc(Number(slot.x ?? 0));
    const oy = Math.trunc(Number(slot.y ?? 0));
    const mid = String(slot.mode_id || slot.mode || "").trim().toUpperCase();
    const move = (e: PointerEvent) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cell = clientPointToGridCell(
        e.clientX,
        e.clientY,
        rect,
        grid.columns,
        grid.rows,
        SURFACE_GRID_PADDING_PX,
        SURFACE_GRID_GAP_PX,
      );
      if (!cell) return;
      let nw = cell.col - ox + 1;
      let nh = cell.row - oy + 1;
      nw = Math.max(1, Math.min(nw, grid.columns - ox));
      nh = Math.max(1, Math.min(nh, grid.rows - oy));
      const nextType = deriveExpectedSlotType(nw, nh, grid.columns, grid.rows);
      if (mid && catalogItems?.length) {
        const it = catalogItems.find((x) => x.mode_id.toUpperCase() === mid);
        if (
          it?.supported_slot_types?.length &&
          !modeSupportsSlotTypeLiteral(it.supported_slot_types, nextType)
        ) {
          return;
        }
      }
      patchSlot(resizingSlotId, { w: nw, h: nh });
    };
    const up = () => setResizingSlotId(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizingSlotId, slots, grid.columns, grid.rows, patchSlot, catalogItems]);

  const cols = grid.columns;
  const rows = grid.rows;

  return (
    <Dialog open={open} onClose={onClose} maxWidthClassName="max-w-3xl">
      <DialogContent className="max-h-[min(92vh,840px)] overflow-y-auto">
        <DialogHeader onClose={onClose}>
          <DialogTitle>
            {tr("Surface 网格布局", "Surface grid layout", "Surface mrežni raspored")} · {surfaceId}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "在下方主区域拖动槽位；间距固定。模式在应用布局后到主界面为每个槽选择。",
              "Drag slots in the main area below; spacing is fixed. Pick a mode per slot in the main view after you apply the layout.",
              "Povuci slotove u glavnom području; razmak je fiksni. Modove biraš po slotu u glavnom prikazu nakon primjene rasporeda.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-ink-light mb-2">
              {tr("快速预设", "Quick presets", "Brzi predlošci")}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["morning", tr("晨间", "Morning", "Jutro")],
                  ["work", tr("工作", "Work", "Posao")],
                  ["home", tr("居家", "Home", "Dom")],
                  ["grid2x2", "2×2"],
                  ["grid3x2", "3×2"],
                ] as const
              ).map(([id, label]) => (
                <Button key={id} type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyPreset(id)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-ink/15 bg-paper-dark/40 px-3 py-2 text-xs text-ink space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-ink-light">{tr("当前网格", "Current grid", "Mreža")}: </span>
              <label className="inline-flex items-center gap-1">
                <span className="text-ink-light">{tr("列", "Cols", "Stup.")}</span>
                <select
                  className="rounded border border-ink/20 bg-white px-2 py-1 text-xs"
                  value={grid.columns}
                  onChange={(e) => {
                    trySetGridDimensions(Number(e.target.value), grid.rows);
                  }}
                >
                  {[2, 3, 4].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-1">
                <span className="text-ink-light">{tr("行", "Rows", "Red.")}</span>
                <select
                  className="rounded border border-ink/20 bg-white px-2 py-1 text-xs"
                  value={grid.rows}
                  onChange={(e) => {
                    trySetGridDimensions(grid.columns, Number(e.target.value));
                  }}
                >
                  {[2, 3, 4, 5, 6].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <span className="text-ink-light">gap {SURFACE_GRID_GAP_PX}px · padding {SURFACE_GRID_PADDING_PX}px · </span>
              <span className="text-ink-light">{tr("固定", "fixed", "fiksno")}</span>
            </div>
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-ink-light">
                {tr(
                  "主区域 — 空白处拖拽画槽；拖动移动；右下角缩放",
                  "Main area — drag on empty cells to draw a slot; drag to move; resize from corner",
                  "Povuci po praznim ćelijama za novi slot; povuci za pomicanje; kut za veličinu",
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="text-xs rounded border border-ink/20 bg-white px-2 py-1.5"
                  value={addSlotType}
                  onChange={(e) => setAddSlotType(e.target.value)}
                  aria-label={tr("新槽类型", "New slot type", "Tip novog slota")}
                >
                  {SURFACE_SLOT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={() => addSlotOfType(addSlotType)}>
                  <Plus size={14} />
                  {tr("添加槽位", "Add slot", "Dodaj slot")}
                </Button>
              </div>
            </div>

            <div
              ref={gridRef}
              role="application"
              aria-label={tr("槽位网格", "Slot grid", "Mreža slotova")}
              className="relative rounded-md border border-ink/20 bg-paper-dark/50 select-none"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(48px, 1fr))`,
                gap: SURFACE_GRID_GAP_PX,
                padding: SURFACE_GRID_PADDING_PX,
                aspectRatio: "4 / 3",
                minHeight: "min(52vh, 360px)",
                maxHeight: "min(52vh, 420px)",
              }}
              onDragOver={onGridDragOver}
              onDrop={onGridDrop}
              onClick={() => {
                if (skipGridDeselectRef.current) {
                  skipGridDeselectRef.current = false;
                  return;
                }
                setSelectedSlotId(null);
              }}
            >
              {Array.from({ length: rows * cols }, (_, i) => {
                const rx = i % cols;
                const ry = Math.floor(i / cols);
                return (
                  <div
                    key={`bg-${rx}-${ry}`}
                    className="rounded border border-dashed border-ink/15 bg-paper-dark/25 z-0 pointer-events-auto"
                    style={{ gridColumn: rx + 1, gridRow: ry + 1 }}
                    onPointerDown={(e) => onCellPointerDown(e, rx, ry)}
                  />
                );
              })}

              {drawPreview ? (
                <div
                  className="z-1 pointer-events-none rounded border-2 border-dashed border-amber-500/90 bg-amber-200/15"
                  style={{
                    gridColumn: `${drawPreview.x + 1} / span ${drawPreview.w}`,
                    gridRow: `${drawPreview.y + 1} / span ${drawPreview.h}`,
                  }}
                />
              ) : null}

              {previewSlots.map((slot) => {
                const sid = String(slot.id || "");
                const st = String(slot.slot_type || "");
                const isSelected = selectedSlotId === sid;
                const isDragging = draggingSlotId === sid;
                const isInvalid = invalidSlotIds.has(sid);
                return (
                  <div
                    key={sid || `${slot.x}-${slot.y}-${st}`}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => onSlotDragStart(e, sid)}
                    onDragEnd={onSlotDragEnd}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSlotId(sid);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedSlotId(sid);
                      }
                    }}
                    style={{
                      gridColumn: `${Number(slot.x ?? 0) + 1} / span ${Number(slot.w ?? 1)}`,
                      gridRow: `${Number(slot.y ?? 0) + 1} / span ${Number(slot.h ?? 1)}`,
                    }}
                    className={[
                      "relative z-1 flex min-h-[44px] flex-col justify-center rounded border px-2 py-1.5 text-left text-[11px] leading-tight shadow-sm transition-colors cursor-grab active:cursor-grabbing",
                      isInvalid
                        ? "border-red-600 bg-red-50/90 ring-2 ring-red-400/40"
                        : isSelected
                          ? "border-amber-500 bg-amber-50/90 ring-2 ring-amber-400/50"
                          : "border-ink/30 bg-white hover:bg-paper-dark/40",
                      isDragging ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-1">
                      <Move size={12} className="mt-0.5 shrink-0 text-ink-light" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink truncate">{sid || "—"}</div>
                        <div className="text-ink-light">{st}</div>
                      </div>
                    </div>
                    {isSelected ? (
                      <button
                        type="button"
                        aria-label={tr("缩放槽位", "Resize slot", "Promijeni veličinu")}
                        className="absolute bottom-0.5 right-0.5 z-10 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-ink/25 bg-white/90 shadow-sm"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setResizingSlotId(sid);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {selectedSlot ? (
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-ink/15 bg-paper-dark/30 p-3 text-xs">
                <div className="text-[10px] font-mono text-ink-light break-all">
                  grid {grid.columns}×{grid.rows} · cell ({Number(selectedSlot.x ?? 0)},{Number(selectedSlot.y ?? 0)}) ·{" "}
                  {Number(selectedSlot.w ?? 1)}×{Number(selectedSlot.h ?? 1)} ·{" "}
                  {deriveExpectedSlotType(
                    Math.trunc(Number(selectedSlot.w ?? 1)),
                    Math.trunc(Number(selectedSlot.h ?? 1)),
                    grid.columns,
                    grid.rows,
                  )}
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-2">
                <span className="text-ink-light self-center sm:mr-1">{tr("已选槽", "Selected", "Odabrano")}</span>
                <label className="flex flex-col gap-0.5 min-w-[100px]">
                  <span className="text-ink-light">id</span>
                  <input
                    className="rounded border border-ink/20 px-2 py-1.5 bg-white"
                    value={String(selectedSlot.id ?? "")}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const oldId = String(selectedSlot.id ?? "");
                      patchSlot(oldId, { id: nextId });
                      setSelectedSlotId(nextId);
                    }}
                  />
                </label>
                <label className="flex flex-col gap-0.5 min-w-[120px]">
                  <span className="text-ink-light">slot_type</span>
                  <select
                    className="rounded border border-ink/20 px-2 py-1.5 bg-white"
                    value={String(selectedSlot.slot_type || "SMALL")}
                    onChange={(e) => patchSlot(String(selectedSlot.id), { slot_type: e.target.value })}
                  >
                    {SURFACE_SLOT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                {catalogItems && catalogItems.length > 0 ? (
                  <label className="flex flex-col gap-0.5 min-w-[140px] flex-1">
                    <span className="text-ink-light">mode</span>
                    <select
                      className="rounded border border-ink/20 px-2 py-1.5 bg-white"
                      value={String(selectedSlot.mode_id || selectedSlot.mode || "STOIC").toUpperCase()}
                      onChange={(e) => patchSlot(String(selectedSlot.id), { mode_id: e.target.value.toUpperCase() })}
                      disabled={compatibleModesForSelected.length === 0}
                    >
                      {compatibleModesForSelected.length === 0 ? (
                        <option value="">
                          {tr("无兼容模式", "No compatible mode", "Nema kompatibilnog moda")}
                        </option>
                      ) : (
                        compatibleModesForSelected.map((it) => (
                          <option key={it.mode_id} value={it.mode_id.toUpperCase()}>
                            {it.display_name || it.mode_id}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => selectedSlot && duplicateSlot(selectedSlot)}
                  disabled={slots.length >= MAX_SURFACE_SLOTS}
                >
                  <Copy size={14} />
                  {tr("复制", "Duplicate", "Dupliciraj")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => selectedSlot.id && removeSlotById(String(selectedSlot.id))}
                >
                  <Trash2 size={14} />
                  {tr("删除", "Remove", "Ukloni")}
                </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-light">
                {tr("点击槽位以编辑 id 或类型。", "Click a slot to edit its id or type.", "Klikni slot za uređivanje id-a ili tipa.")}
              </p>
            )}
          </div>

          {!validation.valid ? (
            <ul className="text-xs text-red-600 list-disc pl-4 space-y-0.5">
              {validation.errors.map((e, i) => (
                <li key={`${e.code}-${i}`}>
                  {e.message}
                  {e.slot_id ? ` (${e.slot_id})` : ""}
                </li>
              ))}
            </ul>
          ) : slotMutationBlocked ? (
            <p className="text-xs text-amber-700">{slotMutationBlocked}</p>
          ) : (
            <p className="text-xs text-green-700">{tr("布局有效", "Layout is valid", "Raspored je valjan")}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-ink/10">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {tr("取消", "Cancel", "Odustani")}
            </Button>
            <Button type="button" size="sm" onClick={handleApply} disabled={!validation.valid}>
              {tr("应用布局", "Apply layout", "Primijeni raspored")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
