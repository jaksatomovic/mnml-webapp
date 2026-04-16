"use client";

import Link from "next/link";
import { CheckCircle2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeviceInfo({
  mac,
  currentUserRole,
  statusIconClass,
  statusClass,
  statusLabel,
  lastSeen,
  isEn,
  locale,
  localeConfigPath,
  tr,
  isFocusListening,
  onToggleFocus,
  focusToggleLoading = false,
}: {
  mac: string;
  currentUserRole: string;
  statusIconClass: string;
  statusClass: string;
  statusLabel: string;
  lastSeen: string | null;
  isEn: boolean;
  locale?: "zh" | "en" | "hr";
  localeConfigPath: string;
  tr: (zh: string, en: string, hr?: string) => string;
  isFocusListening?: boolean;
  onToggleFocus?: () => void;
  focusToggleLoading?: boolean;
}) {
  const hasFocusControl = typeof isFocusListening === "boolean" && !!onToggleFocus;
  return (
    <div className="space-y-2">
      <p className="text-ink-light text-sm flex items-center gap-2 flex-wrap">
        <CheckCircle2 size={14} className={statusIconClass} />
        {tr("设备 MAC", "Device MAC", "MAC uređaja")}:
        <code className="bg-paper-dark px-2 py-0.5 rounded text-xs">{mac}</code>
        {currentUserRole && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-paper-dark text-ink">
            {currentUserRole === "owner"
              ? tr("所有者", "Owner", "Vlasnik")
              : tr("成员", "Member", "Član")}
          </span>
        )}
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${statusClass}`}>
          {statusLabel}
        </span>
        {lastSeen && (
          <span className="text-xs text-ink-light">
            {tr("上次在线", "Last seen", "Zadnji put viđen")}:{" "}
            {new Date(lastSeen).toLocaleString(
              locale === "hr" ? "hr-HR" : isEn ? "en-US" : "zh-CN",
            )}
          </span>
        )}
        <Link href={localeConfigPath} className="text-xs text-ink-light hover:text-ink underline">
          {tr("返回设备列表", "Back to Device List", "Natrag na listu uređaja")}
        </Link>
      </p>
      {currentUserRole === "member" && (
        <p className="text-xs text-amber-700">
          {tr(
            "成员仅可使用设备配置中的 API Key 进行生成。",
            "Members can generate content only with API keys configured in Device Settings.",
            "Članovi mogu generirati sadržaj samo s API ključevima postavljenim u postavkama uređaja.",
          )}
        </p>
      )}
      {hasFocusControl && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Button
            type="button"
            size="sm"
            variant={isFocusListening ? "default" : "outline"}
            className={
              isFocusListening
                ? "h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                : "h-7 px-2 text-xs"
            }
            onClick={onToggleFocus}
            disabled={focusToggleLoading}
          >
            <Target
              size={14}
              className={isFocusListening ? "mr-1.5 text-white" : "mr-1.5 text-emerald-600"}
            />
            {isFocusListening
              ? tr("专注监听已开启", "Focus Listening ON", "Focus Listening uključen")
              : tr("专注监听已关闭", "Focus Listening OFF", "Focus Listening isključen")}
          </Button>
          {isFocusListening ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]">
              {tr(
                "Focus 专注模式就绪，OpenCLAW 守护中",
                "Focus mode armed, OpenCLAW watching",
                "Focus način je spreman, OpenCLAW prati stanje",
              )}
            </span>
          ) : (
            <span className="text-[11px] text-ink-light">
              {tr(
                "开启后设备将在后台保持 Wi-Fi 在线，每 10 秒极速监听openclaw是否有紧急信息传入",
                "When enabled, device stays online and checks alerts every 10s.",
                "Kad je uključeno, uređaj ostaje online i provjerava upozorenja svakih 10 s.",
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
