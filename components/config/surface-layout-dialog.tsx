"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SurfaceLayoutTemplatePicker } from "@/components/config/surface-layout-template-picker";
import {
  cloneTemplateSlots,
  getSurfaceLayoutTemplate,
  matchSurfaceLayoutTemplate,
  TEMPLATE_GRID_COLS,
  TEMPLATE_GRID_ROWS,
  type SurfaceLayoutTemplateId,
} from "@/lib/surface-layout-templates";
import {
  type GridSpec,
  type SurfaceGridSlot,
  buildGridSpec,
  buildLayoutFromSlots,
  mergeSlotModesFromBase,
  normalizeSurfaceGridSpec,
  sortSurfaceSlotsReadingOrder,
  validateLayout,
} from "@/lib/surface-layout";

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

  const syncFromBase = useCallback(() => {
    const g = baseDefinition?.grid as Partial<GridSpec> | undefined;
    const sl = Array.isArray(baseDefinition?.slots) ? (baseDefinition?.slots as SurfaceGridSlot[]) : [];
    setGrid(normalizeSurfaceGridSpec(g));
    setSlots(sl.length ? cloneSlots(sl) : cloneTemplateSlots(getSurfaceLayoutTemplate("layout_8")!));
  }, [baseDefinition]);

  useEffect(() => {
    if (open) syncFromBase();
  }, [open, syncFromBase]);

  const validation = useMemo(
    () => validateLayout({ grid, slots }, catalogItems?.length ? catalogItems : null),
    [slots, grid, catalogItems],
  );

  const applyEightTemplate = useCallback((id: SurfaceLayoutTemplateId) => {
    const meta = getSurfaceLayoutTemplate(id);
    if (!meta) return;
    setGrid(buildGridSpec(TEMPLATE_GRID_COLS, TEMPLATE_GRID_ROWS));
    setSlots(cloneTemplateSlots(meta));
  }, []);

  const eightTemplateValue = useMemo(
    () => matchSurfaceLayoutTemplate(slots, grid.columns, grid.rows),
    [slots, grid.columns, grid.rows],
  );

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

  return (
    <Dialog open={open} onClose={onClose} maxWidthClassName="max-w-4xl">
      <DialogContent className="max-h-[min(92vh,840px)] overflow-y-auto">
        <DialogHeader onClose={onClose}>
          <DialogTitle>
            {tr("Surface 版面", "Surface layout", "Surface raspored")} · {surfaceId}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "选择下方 2×2 分区模板并应用；与当前分区一致时会高亮。",
              "Choose a 2×2 partition template below and apply; the matching one is highlighted.",
              "Odaberi predložak 2×2 particije ispod i primijeni; podudaranje je istaknuto.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SurfaceLayoutTemplatePicker
            value={eightTemplateValue}
            onChange={applyEightTemplate}
            tr={tr}
            title={tr("布局模板 (2×2)", "Layout templates (2×2)", "Predlošci rasporeda (2×2)")}
            hint={tr(
              "点击卡片应用该分区；与当前 2×2 分区一致时会高亮。",
              "Click a card to apply that partition layout; it highlights when your current 2×2 matches.",
              "Klikni karticu za taj raspored; istaknuto kad trenutni 2×2 odgovara.",
            )}
          />

          {!validation.valid ? (
            <ul className="text-xs text-red-600 list-disc pl-4 space-y-0.5">
              {validation.errors.map((e, i) => (
                <li key={`${e.code}-${i}`}>
                  {e.message}
                  {e.slot_id ? ` (${e.slot_id})` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-ink/10">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {tr("取消", "Cancel", "Odustani")}
            </Button>
            <Button type="button" size="sm" onClick={handleApply} disabled={!validation.valid || !baseDefinition}>
              {tr("应用布局", "Apply layout", "Primijeni raspored")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
