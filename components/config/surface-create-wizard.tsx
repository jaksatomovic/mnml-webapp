"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SurfaceLayoutTemplatePicker } from "@/components/config/surface-layout-template-picker";
import {
  buildGridSpec,
  MAX_SURFACE_SLOTS,
  normalizeSurfaceGridSpec,
  sortSurfaceSlotsReadingOrder,
  type GridSpec,
  type SurfaceGridSlot,
} from "@/lib/surface-layout";
import {
  cloneTemplateSlots,
  getSurfaceLayoutTemplate,
  type SurfaceLayoutTemplateId,
} from "@/lib/surface-layout-templates";

export type WizardStart = "blank" | "preset" | "duplicate";

export interface SurfaceCreateWizardProps {
  open: boolean;
  onClose: () => void;
  presetIds: string[];
  duplicateOptions: { id: string; name: string }[];
  tr: (zh: string, en: string, hr?: string) => string;
  /** Load grid+slots from an existing surface definition (preset or duplicate). */
  getDefinition: (surfaceId: string) => Record<string, unknown> | null;
  onComplete: (payload: {
    id: string;
    displayName: string;
    grid: GridSpec;
    slots: SurfaceGridSlot[];
    layout: Array<Record<string, unknown>>;
  }) => void;
}

function emptySlotsForGrid(cols: number, rows: number): SurfaceGridSlot[] {
  const cells = cols * rows;
  if (cells > MAX_SURFACE_SLOTS) {
    throw new Error("grid too large");
  }
  const slots: SurfaceGridSlot[] = [];
  let n = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      slots.push({
        id: `slot_${n}`,
        x,
        y,
        w: 1,
        h: 1,
        slot_type: "SMALL",
      });
      n += 1;
    }
  }
  return slots;
}

function slotsFromDefinition(def: Record<string, unknown> | null): SurfaceGridSlot[] | null {
  if (!def || !Array.isArray(def.slots)) return null;
  const raw = def.slots as SurfaceGridSlot[];
  if (!raw.length) return null;
  return raw.map((s) => {
    const copy = { ...s } as SurfaceGridSlot;
    delete copy.mode_id;
    delete copy.mode;
    return copy;
  });
}

export function SurfaceCreateWizard({
  open,
  onClose,
  presetIds,
  duplicateOptions,
  tr,
  getDefinition,
  onComplete,
}: SurfaceCreateWizardProps) {
  const [step, setStep] = useState(1);
  const [start, setStart] = useState<WizardStart>("blank");
  const [presetRef, setPresetRef] = useState<string>(presetIds[0] || "");
  const [duplicateId, setDuplicateId] = useState<string>(duplicateOptions[0]?.id || "");
  /** When "blank": one of 8 layout templates. */
  const [layoutTemplateId, setLayoutTemplateId] = useState<SurfaceLayoutTemplateId>("layout_8");
  const [displayName, setDisplayName] = useState("");

  const reset = () => {
    setStep(1);
    setStart("blank");
    setLayoutTemplateId("layout_8");
    setDisplayName("");
  };

  const finish = () => {
    const id = `custom_${Date.now().toString(36)}`;
    const name = displayName.trim() || id;
    let grid: GridSpec;
    let slots: SurfaceGridSlot[];

    if (start === "blank") {
      const meta = getSurfaceLayoutTemplate(layoutTemplateId);
      if (!meta) return;
      grid = buildGridSpec(2, 2);
      slots = cloneTemplateSlots(meta);
    } else {
      const sid = start === "preset" ? presetRef : duplicateId;
      const def = getDefinition(sid);
      const borrowed = slotsFromDefinition(def);
      if (borrowed?.length) {
        grid = normalizeSurfaceGridSpec(def?.grid as GridSpec);
        slots = borrowed.map((s) => ({ ...s, mode_id: undefined, mode: undefined }));
      } else {
        const cols = 2;
        const rows = 2;
        if (cols * rows > MAX_SURFACE_SLOTS) return;
        grid = buildGridSpec(cols, rows);
        slots = emptySlotsForGrid(cols, rows);
      }
    }

    const ordered = sortSurfaceSlotsReadingOrder(slots);
    onComplete({ id, displayName: name, grid, slots: ordered, layout: [] });
    reset();
    onClose();
  };

  const step2ForBorrowed = start === "preset" || start === "duplicate";

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <DialogContent className={`${step === 2 && !step2ForBorrowed ? "max-w-2xl" : "max-w-lg"}`}>
        <DialogHeader
          onClose={() => {
            reset();
            onClose();
          }}
        >
          <DialogTitle>{tr("新建自定义 Surface", "Create custom surface", "Novi prilagođeni surface")}</DialogTitle>
          <DialogDescription>
            {tr("步骤", "Step", "Korak")} {step}/3 —{" "}
            {step === 1
              ? tr("选择起点", "Choose starting point", "Polazište")
              : step === 2
                ? tr("选择布局", "Choose layout", "Odaberi raspored")
                : tr("名称", "Name", "Naziv")}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="ws" checked={start === "blank"} onChange={() => setStart("blank")} />
              {tr("空白布局", "Blank layout", "Prazan raspored")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="ws" checked={start === "preset"} onChange={() => setStart("preset")} />
              {tr("从预设复制结构", "From preset layout", "Iz predloška")}
            </label>
            {start === "preset" ? (
              <select
                className="ink-native-select w-full"
                value={presetRef}
                onChange={(e) => setPresetRef(e.target.value)}
              >
                {presetIds.map((sid) => (
                  <option key={sid} value={sid}>
                    {sid}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="ws" checked={start === "duplicate"} onChange={() => setStart("duplicate")} />
              {tr("复制已有 Surface", "Duplicate existing", "Dupliciraj postojeći")}
            </label>
            {start === "duplicate" ? (
              <select
                className="ink-native-select w-full"
                value={duplicateId}
                onChange={(e) => setDuplicateId(e.target.value)}
              >
                {duplicateOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button type="button" size="sm" onClick={() => setStep(2)}>
                {tr("下一步", "Next", "Dalje")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {step2ForBorrowed ? (
              <p className="text-sm text-ink-light">
                {tr(
                  "布局将从所选预设或副本继承；下一步输入名称即可创建。",
                  "Layout will be copied from your selection; next, enter a name.",
                  "Raspored se kopira iz odabira; zatim unesi naziv.",
                )}
              </p>
            ) : (
              <>
                <SurfaceLayoutTemplatePicker
                  value={layoutTemplateId}
                  onChange={setLayoutTemplateId}
                  tr={tr}
                  title={tr("选择布局", "Choose a layout", "Odaberi raspored")}
                  hint={tr(
                    "从 8 种布局中选一种搭建面板。",
                    "Pick one of 8 layouts for your dashboard.",
                    "Odaberi jedan od 8 rasporeda za panel.",
                  )}
                />
              </>
            )}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>
                {tr("上一步", "Back", "Natrag")}
              </Button>
              <Button type="button" size="sm" onClick={() => setStep(3)}>
                {tr("下一步", "Next", "Dalje")}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <input
              className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
              placeholder={tr("显示名称", "Display name", "Naziv")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(2)}>
                {tr("上一步", "Back", "Natrag")}
              </Button>
              <Button type="button" size="sm" onClick={() => finish()} disabled={!displayName.trim()}>
                {tr("创建并打开布局", "Create & open layout", "Stvori i otvori")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
