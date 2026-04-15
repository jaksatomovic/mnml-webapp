"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EInkPreviewPanel({
  tr,
  previewModeLabel,
  previewLoading,
  previewStatusText,
  previewImg,
  previewCacheHit,
  previewLlmStatus,
  onRegenerate,
  onApplyToScreen,
  canApplyToScreen,
  applyToScreenLoading,
  rightActions,
  previewToolbar,
  emptyStateHint,
  regenerateDisabled,
  showPreviewTitle = true,
}: {
  tr: (zh: string, en: string, hr?: string) => string;
  previewModeLabel: string;
  previewLoading: boolean;
  previewStatusText: string;
  previewImg: string | null;
  previewCacheHit: boolean | null;
  previewLlmStatus: string | null;
  onRegenerate: () => void;
  onApplyToScreen?: () => void;
  canApplyToScreen?: boolean;
  applyToScreenLoading?: boolean;
  rightActions?: ReactNode;
  /** Row above the preview image (e.g. slot-size filter). */
  previewToolbar?: ReactNode;
  /** Overrides the default empty-state line under the eye icon */
  emptyStateHint?: string;
  /** Extra disable for Regenerate (e.g. Surfaces: no surface selected yet). */
  regenerateDisabled?: boolean;
  /** When false, hides the left “E-Ink Preview”; optional right label still shows. */
  showPreviewTitle?: boolean;
}) {
  return (
    <Card className="w-full max-w-[400px] mx-auto">
      <CardHeader className={`pb-2 ${showPreviewTitle === false && !previewModeLabel ? "hidden" : ""}`}>
        {showPreviewTitle !== false ? (
          <CardTitle className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-base font-semibold text-ink">{tr("水墨屏预览", "E-Ink Preview", "E-Ink pregled")}</span>
            <span className="text-base font-semibold text-ink">{previewModeLabel}</span>
          </CardTitle>
        ) : previewModeLabel ? (
          <CardTitle className="flex justify-end">
            <span className="text-base font-semibold text-ink truncate max-w-full">{previewModeLabel}</span>
          </CardTitle>
        ) : null}
      </CardHeader>
      {/* keep sizing consistent with /preview page */}
      <CardContent className="h-[calc(55vh-80px)] w-full max-w-[400px] mx-auto flex flex-col p-0">
        <div className="flex flex-col flex-1 min-h-0 w-full px-3">
          {previewToolbar ? <div className="w-full shrink-0 mb-4">{previewToolbar}</div> : null}
          <div className="border border-ink/10 rounded-xl bg-paper flex flex-col items-center justify-center flex-1 w-full min-h-0 py-3 px-3">
          {previewLoading ? (
            <div className="flex w-full max-w-[400px] aspect-[4/3] items-center justify-center rounded-xl border border-ink/15 bg-white">
              <div className="text-center px-4">
                <Loader2 size={32} className="animate-spin mx-auto text-ink-light mb-3" />
                <p className="text-sm text-ink-light">{previewStatusText || tr("预览生成中...", "Generating preview...", "Generiram pregled...")}</p>
              </div>
            </div>
          ) : previewImg ? (
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="relative w-full max-w-[400px] aspect-[4/3] bg-white border border-ink/20 rounded-xl overflow-hidden shrink-0">
                <Image src={previewImg} alt="Preview" fill unoptimized className="object-contain" />
              </div>
              {previewLlmStatus ? (
                <p className="text-[11px] text-ink-light text-center px-2 max-w-[400px]">{previewLlmStatus}</p>
              ) : null}
            </div>
          ) : (
            <div className="flex w-full max-w-[400px] aspect-[4/3] flex-col items-center justify-center rounded-xl border border-ink/20 bg-white px-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]">
              <Eye size={32} className="text-ink-light mb-3 shrink-0" />
              <p className="text-sm text-ink-light text-center leading-snug">
                {emptyStateHint ||
                  tr("点击任意小组件的「预览」查看效果", "Click Preview on any widget to view output", "Klikni Pregled na bilo kojem widgetu za prikaz rezultata")}
              </p>
            </div>
          )}
          </div>
        </div>

        <div className="p-3 pt-2 bg-white">
          {previewImg && !previewLoading && previewCacheHit === true ? (
            <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1.5">
              {tr(
                "当前预览为历史缓存。如需查看最新效果，请点击“重新生成预览”。",
                'Current preview is from cache. Click "Regenerate Preview" to fetch latest output.',
                'Trenutni pregled dolazi iz cachea. Klikni "Ponovno generiraj pregled" za najnoviji rezultat.',
              )}
            </div>
          ) : null}
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={!previewModeLabel || previewLoading || Boolean(regenerateDisabled)}
              className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
            >
              {tr("重新生成预览", "Regenerate Preview", "Ponovno generiraj pregled")}
            </Button>
            {onApplyToScreen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onApplyToScreen}
                disabled={!canApplyToScreen || applyToScreenLoading || previewLoading}
                className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
              >
                {applyToScreenLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {tr("应用到墨水屏", "Apply to E-Ink", "Primijeni na E-Ink")}
              </Button>
            ) : null}
            {rightActions ? <div className="ml-auto flex items-center gap-2">{rightActions}</div> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
