"use client";

import { useState } from "react";
import { ChevronDown, Eye, LayoutGrid, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorSelect } from "@/components/ui/color-select";

type ModeMeta = Record<string, { name: string; tip: string }>;

type ModeSelectorProps = {
  tr: (zh: string, en: string, hr?: string) => string;
  selectedModes: Set<string>;
  customModes: string[];
  customModeMeta: ModeMeta;
  modeMeta: ModeMeta;
  coreModes: string[];
  extraModes: string[];
  handleModePreview: (mode: string) => void;
  handleModeApply: (mode: string) => void;
  handleCustomModeDelete: (mode: string) => void;
  setEditingCustomMode: (value: boolean) => void;
  setCustomDesc: (value: string) => void;
  setCustomModeName: (value: string) => void;
  setCustomJson: (value: string) => void;
  /** When set, the dashed “+” tile runs this instead of opening the legacy custom editor directly. */
  onPlusClick?: () => void;
  previewColors?: number;
  onColorsChange?: (v: number) => void;
};

export function ModeSelector({
  tr,
  selectedModes,
  customModes,
  customModeMeta,
  modeMeta,
  coreModes,
  extraModes,
  handleModePreview,
  handleModeApply,
  handleCustomModeDelete,
  setEditingCustomMode,
  setCustomDesc,
  setCustomModeName,
  setCustomJson,
  onPlusClick,
  previewColors,
  onColorsChange,
}: ModeSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid size={18} /> {tr("小组件", "Widgets", "Widgeti")}
          </CardTitle>
          {onColorsChange && previewColors !== undefined && (
            <ColorSelect value={previewColors} onChange={onColorsChange} tr={tr} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ModeGrid
          tr={tr}
          title={tr("核心小组件", "Core widgets", "Glavni widgeti")}
          modes={coreModes}
          selectedModes={selectedModes}
          onPreview={handleModePreview}
          onApply={handleModeApply}
          modeMeta={modeMeta}
        />
        <ModeGrid
          tr={tr}
          title={tr("更多小组件", "More widgets", "Dodatni widgeti")}
          modes={extraModes}
          selectedModes={selectedModes}
          onPreview={handleModePreview}
          onApply={handleModeApply}
          modeMeta={modeMeta}
        />
        <ModeGrid
          tr={tr}
          title={tr("自定义小组件", "Custom widgets", "Prilagođeni widgeti")}
          modes={customModes}
          selectedModes={selectedModes}
          onPreview={handleModePreview}
          onApply={handleModeApply}
          onDelete={handleCustomModeDelete}
          modeMeta={{ ...modeMeta, ...customModeMeta }}
          tailItem={
            <button
              type="button"
              onClick={() => {
                if (onPlusClick) {
                  onPlusClick();
                  return;
                }
                setEditingCustomMode(true);
                setCustomJson("");
                setCustomDesc("");
                setCustomModeName("");
              }}
              className="rounded-xl border border-dashed border-ink/20 bg-white px-3 py-2 h-[118px] flex flex-col items-center justify-center text-ink-light hover:border-ink/40 hover:bg-paper-dark transition-colors"
              title={tr("新建自定义小组件", "Create custom widget", "Izradi prilagođeni widget")}
            >
              <Plus size={18} className="mb-1" />
              <div className="text-[11px]">{tr("新建", "New", "Novo")}</div>
            </button>
          }
        />
      </CardContent>
    </Card>
  );
}

function ModeGrid({
  tr,
  title,
  modes,
  selectedModes,
  onPreview,
  onApply,
  onDelete,
  modeMeta,
  tailItem,
}: {
  tr: (zh: string, en: string, hr?: string) => string;
  title: string;
  modes: string[];
  selectedModes: Set<string>;
  onPreview: (mode: string) => void;
  onApply: (mode: string) => void;
  onDelete?: (mode: string) => void;
  modeMeta: ModeMeta;
  tailItem?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (modes.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 rounded-xl bg-paper-dark border border-ink/10 px-3 py-2">
        <h4 className="text-base font-semibold text-ink">{title}</h4>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-xs text-ink-light hover:text-ink flex items-center gap-1 transition-colors"
        >
          {collapsed ? tr("展开", "Expand", "Proširi") : tr("收起", "Collapse", "Sažmi")}
          <ChevronDown size={14} className={`transition-transform ${collapsed ? "" : "rotate-180"}`} />
        </button>
      </div>

      {collapsed ? null : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {modes.map((mode) => {
            const meta = modeMeta[mode] || { name: mode, tip: "" };
            const isSelected = selectedModes.has(mode);

            return (
              <div
                key={mode}
                className="flex h-[118px] flex-col rounded-xl border border-ink/10 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onApply(mode)}
                  className={`flex h-20 w-full shrink-0 flex-col justify-start overflow-hidden px-3 py-2 text-left transition-colors ${
                    isSelected ? "bg-ink text-white" : "hover:bg-paper-dark text-ink"
                  }`}
                  title={meta.tip}
                >
                  <div className="text-sm font-semibold leading-tight line-clamp-2">{meta.name}</div>
                  <div
                    className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${isSelected ? "text-white/80" : "text-ink-light"}`}
                  >
                    {meta.tip}
                  </div>
                </button>

                <div className={`grid shrink-0 border-t border-ink/10 h-9 ${onDelete ? "grid-cols-5" : "grid-cols-4"}`}>
                  <button
                    type="button"
                    onClick={() => onPreview(mode)}
                    className="col-span-2 px-2 text-[11px] sm:text-xs text-ink hover:bg-ink hover:text-white transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                    title={tr("预览", "Preview", "Pregled")}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onApply(mode)}
                    className="col-span-2 px-2 text-[11px] sm:text-xs text-ink hover:bg-ink hover:text-white transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                    title={isSelected ? tr("移出已启用", "Remove from enabled set", "Ukloni iz uključenih") : tr("加入已启用", "Add to enabled set", "Dodaj u uključene")}
                  >
                    {isSelected ? "-" : "+"}
                  </button>
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(mode)}
                      className="px-2 text-[11px] sm:text-xs text-ink hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center"
                      title={tr("删除小组件", "Delete widget", "Izbriši widget")}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {tailItem ? tailItem : null}
        </div>
      )}
    </div>
  );
}
