"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LocationPicker } from "@/components/config/location-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Eye, Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { localeFromPathname, pickByLocale, t, withLocalePath, type Locale } from "@/lib/i18n";
import { cleanLocationValue, type LocationValue } from "@/lib/locations";
import { authHeaders, fetchCurrentUser } from "@/lib/auth";
import { ColorSelect } from "@/components/ui/color-select";
import { CalendarReminders } from "@/components/config/calendar-reminders";
import { TimetableEditor, type TimetableData } from "@/components/config/timetable-editor";
import {
  DEFAULT_PANEL_H,
  DEFAULT_PANEL_W,
  inksightBodySize,
} from "@/lib/inksight-chrome";

type ModeCatalogItem = {
  mode_id: string;
  category: "core" | "more" | "custom" | string;
  source?: string;
  display_name?: string;
  description?: string;
  i18n?: {
    zh?: { name?: string; tip?: string };
    en?: { name?: string; tip?: string };
    hr?: { name?: string; tip?: string };
  };
};

function ModeSection({
  title,
  modes,
  currentMode,
  onPreview,
  collapsible,
  customMeta,
  tailItem,
  locale,
}: {
  title: string;
  modes: string[];
  currentMode: string;
  onPreview: (m: string) => void;
  collapsible?: boolean;
  customMeta?: Record<string, { name: string; tip: string }>;
  tailItem?: React.ReactNode;
  locale: Locale;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!modes.length) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 rounded-xl bg-paper-dark border border-ink/10 px-3 py-2">
        <h4 className="text-base font-semibold text-ink">{title}</h4>
        {collapsible ? (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-xs text-ink-light hover:text-ink flex items-center gap-1 transition-colors"
          >
            {pickByLocale(locale, {
              zh: collapsed ? "展开" : "收起",
              en: collapsed ? "Expand" : "Collapse",
              hr: collapsed ? "Proširi" : "Sažmi",
            })}
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {modes.map((m) => {
            const meta = customMeta?.[m] || { name: m, tip: "" };
            const isCurrent = currentMode === m;
            return (
              <div key={m} className="rounded-xl border border-ink/10 bg-white overflow-hidden">
                <button
                  onClick={() => onPreview(m)}
                  className={`w-full px-3 py-2 text-left transition-colors min-h-[64px] flex flex-col justify-center ${
                    isCurrent ? "bg-ink text-white" : "hover:bg-paper-dark text-ink"
                  }`}
                  title={meta.tip}
                >
                  <div className="text-sm font-semibold">{meta.name}</div>
                  <div className={`text-[11px] mt-0.5 line-clamp-2 ${isCurrent ? "text-white/80" : "text-ink-light"}`}>
                    {meta.tip}
                  </div>
                </button>
                <div className="border-t border-ink/10">
                  <button
                    onClick={() => onPreview(m)}
                    className="w-full h-9 px-2 text-[11px] sm:text-xs text-ink hover:bg-ink hover:text-white transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <Eye size={14} />
                    {t(
                      localeFromPathname(`/${locale}`),
                      "preview.action.preview",
                      pickByLocale(locale, { zh: "预览", en: "Preview", hr: "Pregled" }),
                    )}
                  </button>
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

export default function ExperiencePage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const tr = (zh: string, en: string, hr = en) => pickByLocale(locale, { zh, en, hr });

  const [authChecked, setAuthChecked] = useState(false);
  const [userLlmApiKey, setUserLlmApiKey] = useState<string>("");

  const [catalogItems, setCatalogItems] = useState<ModeCatalogItem[]>([]);
  const [modesError, setModesError] = useState<string | null>(null);
  // do not preselect any mode
  const [previewMode, setPreviewMode] = useState("");
  const [previewColors, setPreviewColors] = useState(2);
  const [previewModeNameOverride, setPreviewModeNameOverride] = useState<string | null>(null);

  const [city] = useState(pickByLocale(locale, { en: "Zagreb", hr: "Zagreb", zh: "杭州" }));
  const [memoText] = useState(t(locale, "preview.memo.default", pickByLocale(locale, { en: "Write something…", hr: "Napiši nešto…", zh: "写点什么吧…" })));

  const [previewLoading, setPreviewLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  // Status message describing the LLM outcome for the active preview.
  const [previewLlmStatus, setPreviewLlmStatus] = useState<string | null>(null);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const lastObjectUrlRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [modal, setModal] = useState<null | { type: "quote" | "weather" | "memo" | "countdown" | "habit" | "lifebar" | "calendar" | "timetable" | "bf6"; modeId: string }>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_imageUploadLoading, setImageUploadLoading] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [weatherDraftLocation, setWeatherDraftLocation] = useState<LocationValue>({
    city: pickByLocale(locale, { en: "Zagreb", hr: "Zagreb", zh: "杭州" }),
  });
  const [memoDraft, setMemoDraft] = useState("");
  const [bf6UsernameDraft, setBf6UsernameDraft] = useState("");
  const [bf6PlatformDraft, setBf6PlatformDraft] = useState("pc");
  const [calendarReminders, setCalendarReminders] = useState<Record<string, string>>({});
  const [timetableData, setTimetableData] = useState<TimetableData>({
    style: "weekly",
    periods: ["08:00-09:30", "10:00-11:30", "14:00-15:30", "16:00-17:30"],
    courses: {
      "0-0": "Calculus/A201", "0-2": "Linear Algebra/A201",
      "1-1": "English/B305", "1-3": "PE/Gym",
      "2-0": "Data Structures/C102", "2-2": "Computer Networks/C102",
      "3-1": "Probability/A201", "3-3": "Social Studies/D405",
      "4-0": "Operating Systems/C102",
    },
  });

  // Countdown mode draft state.
  const [countdownName, setCountdownName] = useState(
    pickByLocale(locale, { en: "New Year", hr: "Nova Godina", zh: "元旦" }),
  );
  const [countdownDate, setCountdownDate] = useState("2027-01-01");
  
  // Habit mode draft state.
  const [habitItems, setHabitItems] = useState([
    { name: pickByLocale(locale, { en: "Wake up early", hr: "Rano ustajanje", zh: "早起" }), done: false },
    { name: pickByLocale(locale, { en: "Exercise", hr: "Vježbanje", zh: "运动" }), done: false },
    { name: pickByLocale(locale, { en: "Reading", hr: "Čitanje", zh: "阅读" }), done: false },
  ]);
  
  // Lifebar draft state.
  const [userAge, setUserAge] = useState(30);
  const [lifeExpectancy, setLifeExpectancy] = useState<100 | 120>(100);
  
  const [showCustomModeModal, setShowCustomModeModal] = useState(false);
  const [customDesc, setCustomDesc] = useState("");
  const [customModeName, setCustomModeName] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [customGenerating, setCustomGenerating] = useState(false);

  const adaptiveFileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadLocalImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const up = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!up.ok) {
      const err = await up.text().catch(() => "");
      throw new Error(err || `upload failed: ${up.status}`);
    }
    const data = (await up.json()) as { url?: string };
    if (!data.url) throw new Error("upload failed: missing url");
    return data.url;
  };

  // Require sign-in before entering the no-device preview flow.
  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (!u) {
          router.replace(withLocalePath(locale, "/login"));
          return;
        }
        setAuthChecked(true);
      })
      .catch(() => {
        router.replace(withLocalePath(locale, "/login"));
      });
  }, [locale, router]);

  // Read the locally cached user API key written by the config page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const k = localStorage.getItem("ink_user_llm_api_key") || "";
    if (k.trim()) setUserLlmApiKey(k.trim());
  }, []);
  // Invitation-code modal state.
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingInvite, setRedeemingInvite] = useState(false);
  const [pendingPreviewMode, setPendingPreviewMode] = useState<string | null>(null);

  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  };

  const modeMeta = useMemo(() => {
    const map: Record<string, { name: string; tip: string }> = {};
    for (const item of catalogItems) {
      const mid = (item.mode_id || "").toUpperCase();
      if (!mid) continue;
      const lang = locale === "zh" ? item.i18n?.zh : locale === "hr" ? (item.i18n?.hr || item.i18n?.en) : item.i18n?.en;
      const name =
        (lang?.name && String(lang.name)) ||
        (item.display_name && String(item.display_name)) ||
        mid;
      const tip =
        (lang?.tip && String(lang.tip)) ||
        (item.description && String(item.description)) ||
        "";
      map[mid] = { name, tip };
    }
    return map;
  }, [catalogItems, locale]);

  const coreModes = useMemo(
    () => catalogItems.filter((m) => m.category === "core").map((m) => m.mode_id.toUpperCase()),
    [catalogItems],
  );
  const moreModes = useMemo(
    () =>
      catalogItems
        .filter((m) => m.category === "more")
        .map((m) => m.mode_id.toUpperCase()),
    [catalogItems],
  );
  const customModes = useMemo(
    () =>
      catalogItems
        .filter((m) => m.category === "custom")
        .map((m) => m.mode_id.toUpperCase()),
    [catalogItems],
  );

  const previewModeName =
    previewModeNameOverride ||
    modeMeta[previewMode]?.name ||
    previewMode ||
    t(locale, "preview.unknown_mode", "Unknown");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const previewModeTip =
    modeMeta[previewMode]?.tip ||
    "";

  const handlePreview = async (modeId?: string, override?: Record<string, unknown> | LocationValue) => {
    const targetMode = modeId || previewMode;
    if (!targetMode) return;
    if (!authChecked) return;

    // Check whether we need to open a parameter modal first.
    if (!override) {
      if (targetMode === "WEATHER") {
        setModal({ type: "weather", modeId: targetMode });
        setWeatherDraftLocation({});
        return;
      }
      if (targetMode === "MEMO") {
        setModal({ type: "memo", modeId: targetMode });
        setMemoDraft(memoText);
        return;
      }
      if (targetMode === "MY_QUOTE") {
        setModal({ type: "quote", modeId: targetMode });
        return;
      }
      if (targetMode === "COUNTDOWN") {
        setModal({ type: "countdown", modeId: targetMode });
        return;
      }
      if (targetMode === "HABIT") {
        setModal({ type: "habit", modeId: targetMode });
        return;
      }
      if (targetMode === "LIFEBAR") {
        setModal({ type: "lifebar", modeId: targetMode });
        return;
      }
      if (targetMode === "CALENDAR") {
        setModal({ type: "calendar", modeId: targetMode });
        return;
      }
      if (targetMode === "TIMETABLE") {
        setModal({ type: "timetable", modeId: targetMode });
        return;
      }
      if (targetMode === "BF6_PROFILE") {
        setModal({ type: "bf6", modeId: targetMode });
        return;
      }
    }

    // Clear the previous LLM status when previewing a regular mode.
    setPreviewLlmStatus(null);

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const params = new URLSearchParams();
      params.set("persona", targetMode);
      params.set("ui_language", locale === "zh" ? "zh" : "en");
      if (previewColors > 2) params.set("colors", String(previewColors));
      
      // City override priority: mode override first, then the global city.
      const cityOverride = override?.city ? String(override.city) : city.trim();
      if (cityOverride) {
        params.set("city_override", cityOverride);
      }
      
      // Memo override priority: mode override first, then the draft memo.
      if (targetMode === "MEMO") {
        const memoOverrideValue =
          override && "memo_text" in override ? override.memo_text : undefined;
        const memoOverride = memoOverrideValue ? String(memoOverrideValue) : memoText;
        params.set("memo_text", memoOverride);
      }
      
      const mergedOverride: Record<string, unknown> = { ...(override || {}) };
      if (targetMode.toUpperCase() === "CALENDAR" && Object.keys(calendarReminders).length > 0) {
        mergedOverride.reminders = calendarReminders;
      }
      if (targetMode.toUpperCase() === "TIMETABLE" && !override) {
        mergedOverride.style = timetableData.style;
        mergedOverride.periods = timetableData.periods;
        mergedOverride.courses = timetableData.courses;
      }
      if (Object.keys(mergedOverride).length > 0) {
        params.set("mode_override", JSON.stringify(mergedOverride));
      }

      const body = inksightBodySize(DEFAULT_PANEL_W, DEFAULT_PANEL_H);
      params.set("w", String(body.w));
      params.set("h", String(body.h));

      const res = await fetch(`/api/preview?${params.toString()}`, {
        headers: authHeaders(userLlmApiKey ? { "x-inksight-llm-api-key": userLlmApiKey } : undefined),
      });
      if (res.status === 402) {
        // Free quota is exhausted, so show the invitation-code modal.
        const data = await res.json().catch(() => ({}));
        if (data.requires_invite_code) {
          setPendingPreviewMode(targetMode);
          setShowInviteModal(true);
          setPreviewLoading(false);
          return;
        }
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`${t(locale, "preview.error.preview_failed", "Preview failed")}: HTTP ${res.status} ${errText.substring(0, 120)}`);
      }

      const statusHeader = res.headers.get("x-preview-status");
      const llmRequired = res.headers.get("x-llm-required");
      
      if (statusHeader === "no_llm_required" || llmRequired === "0") {
        setPreviewLlmStatus(null);
      } else if (statusHeader === "model_generated") {
        setPreviewLlmStatus(tr("大模型调用成功", "Model call succeeded", "Model je uspješno pozvan"));
      } else if (statusHeader === "fallback_used") {
        setPreviewLlmStatus(tr("大模型调用失败，使用默认内容", "Model call failed, using fallback content", "Poziv modela nije uspio, koristi se zadani sadržaj"));
      } else {
        setPreviewLlmStatus(null);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = objectUrl;
      setPreviewImageUrl(objectUrl);
      showToast(t(locale, "preview.toast.updated", "Preview updated"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t(locale, "preview.error.preview_failed", "Preview failed");
      setPreviewError(msg);
      showToast(msg, "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRedeemInviteCode = async () => {
    if (!inviteCode.trim()) {
      showToast(tr("请输入邀请码", "Please enter invitation code", "Unesi kod pozivnice"), "error");
      return;
    }

    setRedeemingInvite(true);
    try {
      const res = await fetch("/api/auth/redeem-invite-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || tr("邀请码兑换失败", "Failed to redeem invitation code", "Iskorištavanje koda pozivnice nije uspjelo"));
      }

      showToast(data.message || tr("邀请码兑换成功", "Invitation code redeemed successfully", "Kod pozivnice je uspješno iskorišten"), "success");
      setShowInviteModal(false);
      setInviteCode("");
      // Retry the preview after a successful redeem.
      if (pendingPreviewMode) {
        await handlePreview(pendingPreviewMode);
        setPendingPreviewMode(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("邀请码兑换失败", "Failed to redeem invitation code", "Iskorištavanje koda pozivnice nije uspjelo");
      showToast(msg, "error");
    } finally {
      setRedeemingInvite(false);
    }
  };

  const applyModeAndPreview = async (modeId: string) => {
    // Custom flows
    if (modeId === "MY_ADAPTIVE") {
      setPreviewMode(modeId);
      adaptiveFileInputRef.current?.click();
      return;
    }
    if (modeId === "MY_QUOTE") {
      setPreviewMode(modeId);
      setQuoteDraft("");
      setAuthorDraft("");
      setModal({ type: "quote", modeId });
      return;
    }
    if (modeId === "WEATHER") {
      setPreviewMode(modeId);
      setWeatherDraftLocation({});
      setModal({ type: "weather", modeId });
      return;
    }
    if (modeId === "MEMO") {
      setPreviewMode(modeId);
      setMemoDraft(memoText);
      setModal({ type: "memo", modeId });
      return;
    }
    if (modeId === "CALENDAR") {
      setPreviewMode(modeId);
      setModal({ type: "calendar", modeId });
      return;
    }
    if (modeId === "TIMETABLE") {
      setPreviewMode(modeId);
      setModal({ type: "timetable", modeId });
      return;
    }
    if (modeId === "BF6_PROFILE") {
      setPreviewMode(modeId);
      setBf6UsernameDraft("");
      setBf6PlatformDraft("pc");
      setModal({ type: "bf6", modeId });
      return;
    }

    setPreviewModeNameOverride(null);
    setPreviewMode(modeId);
    await handlePreview(modeId);
  };

  const handleCustomModePreview = async (defOverride?: unknown) => {
    if (!defOverride && !customJson.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewLlmStatus(null);
    try {
      const def = defOverride ? (defOverride as Record<string, unknown>) : (JSON.parse(customJson) as Record<string, unknown>);
      const nameFromInput = customModeName.trim();
      const displayNameRaw = (def as Record<string, unknown>)["display_name"];
      const modeIdRaw = (def as Record<string, unknown>)["mode_id"];
      const nameFromDef =
        (typeof displayNameRaw === "string" && displayNameRaw.trim()) ||
        (typeof modeIdRaw === "string" && modeIdRaw.trim()) ||
        "";
      const displayName = nameFromInput || nameFromDef || tr("自定义小组件", "Custom widget", "Prilagođeni widget");
      setPreviewModeNameOverride(displayName);
      setPreviewMode(displayName.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
      const res = await fetch("/api/modes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode_def: def, colors: previewColors }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Preview failed");
      }
      const statusHeader = res.headers.get("x-preview-status");
      const llmRequired = res.headers.get("x-llm-required");
      
      if (statusHeader === "no_llm_required" || llmRequired === "0") {
        setPreviewLlmStatus(null);
      } else if (statusHeader === "model_generated") {
        setPreviewLlmStatus(tr("大模型调用成功", "Model call succeeded", "Model je uspješno pozvan"));
      } else if (statusHeader === "fallback_used") {
        setPreviewLlmStatus(tr("大模型调用失败，使用默认内容", "Model call failed, using fallback content", "Poziv modela nije uspio, koristi se zadani sadržaj"));
      } else {
        setPreviewLlmStatus(null);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = url;
      setPreviewImageUrl(url);
      showToast(
        t(locale, "preview.toast.updated", "Preview updated"),
        "success",
      );
    } catch (e) {
      const msg = `${tr("预览失败: ", "Preview failed: ", "Pregled nije uspio: ")}${e instanceof Error ? e.message : "Unknown error"}`;
      setPreviewError(msg);
      showToast(msg, "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerateCustomModeAndPreview = async () => {
    if (!customDesc.trim()) {
      showToast(tr("请输入小组件描述", "Please enter a description for the widget", "Unesi opis widgeta"), "error");
      return;
    }
    setCustomGenerating(true);
    try {
      const res = await fetch("/api/modes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: customDesc }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generate failed");
      setCustomJson(JSON.stringify(data.mode_def, null, 2));
      if (!customModeName.trim()) {
        setCustomModeName((data.mode_def?.display_name || "").toString());
      }
      // generation complete -> close dialog -> preview on main panel
      setShowCustomModeModal(false);
      await handleCustomModePreview(data.mode_def);
    } catch (e) {
      showToast(
        `${tr("生成失败: ", "Generate failed: ", "Generiranje nije uspjelo: ")}${e instanceof Error ? e.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setCustomGenerating(false);
    }
  };
  // (removed) reset(): unused

  useEffect(() => {
    setModesError(null);
    if (!authChecked) return;
    fetch("/api/modes/catalog", { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.items && Array.isArray(d.items)) {
          setCatalogItems(d.items);
        } else {
          console.error("[PREVIEW] Invalid catalog response:", d);
          setModesError(t(locale, "preview.error.no_modes", "No widget data"));
        }
      })
      .catch((err) => {
        console.error("[PREVIEW] Failed to load catalog:", err);
        setModesError(t(locale, "preview.error.modes_unreachable", "Cannot load widgets. Make sure backend is running."));
        setCatalogItems([]);
      });
  }, [authChecked, locale]);

  useEffect(() => {
    if (!authChecked) return;
    // no auto-preview on enter; user must pick a mode
  }, [authChecked]);

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // no-op: playlist removed
  }, [previewMode]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Hidden file picker for MY_ADAPTIVE (local upload only) */}
      <input
        ref={adaptiveFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0] || null;
          e.currentTarget.value = "";
          if (!f) return;
          setImageUploadLoading(true);
          try {
            const url = await uploadLocalImage(f);
            await handlePreview("MY_ADAPTIVE", { image_url: url });
          } catch (err) {
            const msg = err instanceof Error ? err.message : t(locale, "preview.modal.image.need_file", "Please choose a local image");
            showToast(msg, "error");
          } finally {
            setImageUploadLoading(false);
          }
        }}
      />
      <div className="mb-6 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.45)] backdrop-blur-xl flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink mb-1">{t(locale, "preview.title", "No-device Demo")}</h1>
          <p className="text-ink-light text-sm">{t(locale, "preview.subtitle", "Try widgets and preview without a device.")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[520px_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Card className="rounded-3xl border-black/10 bg-white/85 shadow-[0_24px_80px_-50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <CardTitle>{t(locale, "preview.panel.modes", "Widgets")}</CardTitle>
                  <ColorSelect value={previewColors} onChange={setPreviewColors} tr={(zh, en) => tr(zh, en)} />
                </div>
                <button
                  onClick={() => {
                    setShowCustomModeModal(true);
                    setCustomDesc("");
                    setCustomModeName("");
                    setCustomJson("");
                    setCustomGenerating(false);
                  }}
                  className="rounded-xl border border-dashed border-ink/20 bg-white px-3 py-2 text-sm flex items-center gap-2 text-ink-light hover:border-ink/40 hover:bg-paper-dark transition-colors"
                  title={tr("新建自定义小组件", "Create custom widget", "Izradi prilagođeni widget")}
                >
                  <Plus size={16} />
                  <span>{tr("新建自定义小组件", "Create custom widget", "Izradi prilagođeni widget")}</span>
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {modesError ? (
                <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                  <AlertCircle size={16} className="inline mr-2" />
                  {modesError}
                </div>
              ) : null}

              <ModeSection
                title={t(locale, "preview.section.core", "Core widgets")}
                modes={coreModes}
                currentMode={previewMode}
                onPreview={applyModeAndPreview}
                collapsible
                customMeta={modeMeta}
                locale={locale}
              />

              <ModeSection
                title={t(locale, "preview.section.more", "More widgets")}
                modes={moreModes}
                currentMode={previewMode}
                onPreview={applyModeAndPreview}
                collapsible
                customMeta={modeMeta}
                locale={locale}
              />

              {customModes.length ? (
                <ModeSection
                  title={t(locale, "preview.section.custom", "Custom widgets")}
                  modes={customModes}
                  currentMode={previewMode}
                  onPreview={applyModeAndPreview}
                  collapsible
                  customMeta={modeMeta}
                  locale={locale}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl border-black/10 bg-white/85 shadow-[0_24px_80px_-50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-base font-semibold text-ink">{t(locale, "preview.panel.display", "E-Ink Preview")}</span>
                <span className="text-base font-semibold text-ink">
                  {t(locale, "preview.summary.current_mode", "Widget")}: {previewModeName}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(80vh-220px)] flex flex-col p-0">
              <div className="border border-ink/10 rounded-xl bg-paper flex flex-col items-center justify-center flex-1 w-full">
                {previewLoading ? (
                  <div className="flex items-center justify-center w-full">
                    <div className="text-center">
                      <Loader2 size={32} className="animate-spin mx-auto text-ink-light mb-3" />
                      <p className="text-sm text-ink-light">{t(locale, "preview.state.generating", "Generating preview...")}</p>
                    </div>
                  </div>
                ) : previewImageUrl ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="relative w-full max-w-md aspect-[4/3] bg-white border border-ink/20 rounded-xl overflow-hidden">
                      <Image
                        src={previewImageUrl}
                        alt={t(locale, "preview.display.alt", "NexInk preview")}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    {previewLlmStatus ? (
                      <p className="text-[11px] text-ink-light text-center px-4">
                        {previewLlmStatus}
                      </p>
                    ) : null}
                  </div>
                ) : !previewMode ? (
                  <div className="flex items-center justify-center w-full">
                    <div className="text-center">
                      <Eye size={32} className="mx-auto text-ink-light mb-3" />
                      <p className="text-sm text-ink-light">{t(locale, "preview.select_mode", "Please select a widget")}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full">
                    <div className="text-center">
                      <Eye size={32} className="mx-auto text-ink-light mb-3" />
                      <p className="text-sm text-ink-light">{t(locale, "preview.state.empty_title", "No preview yet")}</p>
                      <p className="text-xs text-ink-light mt-1">{t(locale, "preview.state.empty_hint", "Click Refresh to generate.")}</p>
                    </div>
                  </div>
                )}
              </div>
              {previewMode?.toUpperCase() === "CALENDAR" && (
                <div className="px-4 pb-3">
                  <CalendarReminders
                    reminders={calendarReminders}
                    onChange={setCalendarReminders}
                    tr={(zh, en) => tr(zh, en)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {toast ? (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-fade-in ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : toast.type === "error"
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative w-[min(520px,calc(100vw-32px))] rounded-xl border border-ink/15 bg-white shadow-xl">
            <div className="px-4 py-3 border-b border-ink/10 flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">
                {modal.type === "quote"
                  ? t(locale, "preview.modal.quote.title", tr("自定义语录", "Custom Quote", "Prilagođeni citat"))
                  : modal.type === "weather"
                  ? tr("天气设置", "Weather Settings", "Postavke vremena")
                  : modal.type === "memo"
                  ? tr("便签内容", "Memo Content", "Sadržaj bilješke")
                  : modal.type === "countdown"
                  ? tr("倒计时设置", "Countdown Settings", "Postavke odbrojavanja")
                  : modal.type === "habit"
                  ? tr("习惯打卡", "Habit Tracker", "Praćenje navika")
                  : modal.type === "calendar"
                  ? tr("日历提醒", "Calendar Reminders", "Kalendarski podsjetnici")
                  : modal.type === "timetable"
                  ? tr("课程表设置", "Timetable Settings", "Postavke rasporeda")
                  : modal.type === "bf6"
                  ? tr("BF6 档案设置", "BF6 Profile Settings", "BF6 postavke profila")
                  : tr("人生进度条", "Life Progress", "Životni napredak")}
              </div>
              <button className="text-ink-light hover:text-ink" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              {modal.type === "quote" ? (
                <>
                  <div className="text-xs text-ink-light">
                    {t(locale, "preview.modal.quote.hint", "Generate a deep quote randomly, or paste your own text.")}
                  </div>
                  <textarea
                    value={quoteDraft}
                    onChange={(e) => setQuoteDraft(e.target.value)}
                    placeholder={t(locale, "preview.modal.quote.placeholder", "Type your quote...")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm min-h-28 bg-white"
                  />
                  <input
                    value={authorDraft}
                    onChange={(e) => setAuthorDraft(e.target.value)}
                    placeholder={t(locale, "preview.modal.quote.author_placeholder", "Author (optional)")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setModal(null);
                        // random generate via LLM (no override)
                        await handlePreview(modal.modeId);
                      }}
                      disabled={previewLoading}
                    >
                      {t(locale, "preview.modal.quote.random", tr("随机生成", "Random generate", "Nasumično generiraj"))}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const q = quoteDraft.trim();
                        const a = authorDraft.trim();
                        setModal(null);
                        await handlePreview(modal.modeId, q ? { quote: q, author: a } : {});
                      }}
                      disabled={previewLoading}
                    >
                      {t(locale, "preview.modal.quote.use_input", tr("使用我的输入", "Use my input", "Koristi moj unos"))}
                    </Button>
                  </div>
                </>
              ) : modal.type === "weather" ? (
                <>
                  <div className="text-xs text-ink-light">
                    {tr(
                      "搜索并选择具体地点查看天气，避免重名地点。",
                      "Search and choose a specific place to avoid ambiguous names.",
                      "Pretraži i odaberi točnu lokaciju kako bi izbjegao nejasne nazive.",
                    )}
                  </div>
                  <LocationPicker
                    value={weatherDraftLocation}
                    onChange={setWeatherDraftLocation}
                    locale={locale}
                    placeholder={tr("输入地点名称（如：上海、巴黎、Singapore）", "Enter a place name (e.g. Shanghai, Paris, Singapore)", "Upiši naziv mjesta (npr. Zagreb, Pariz, Singapore)")}
                    helperText={tr("建议从候选列表中点选。", "Pick a result from the suggestion list.", "Odaberi rezultat s popisa prijedloga.")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                    autoFocus
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <Button
                      onClick={async () => {
                        setWeatherDraftLocation({ city: pickByLocale(locale, { zh: "杭州", en: "Zagreb", hr: "Zagreb" }) });
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认城市", "Use default city", "Koristi zadani grad")}
                    </Button>
                    <Button
                      onClick={async () => {
                        const nextLocation = cleanLocationValue(weatherDraftLocation);
                        setModal(null);
                        if (nextLocation.city) {
                          await handlePreview(modal.modeId, nextLocation);
                        } else {
                          await handlePreview(modal.modeId);
                        }
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览天气", "Preview weather", "Pregledaj vrijeme")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "memo" ? (
                <>
                  <div className="text-xs text-ink-light">
                    {tr("输入便签内容，将在墨水屏上显示。", "Enter memo content to display on e-ink screen.", "Unesi sadržaj bilješke koji će se prikazati na e-ink zaslonu.")}
                  </div>
                  <textarea
                    value={memoDraft}
                    onChange={(e) => setMemoDraft(e.target.value)}
                    placeholder={tr("输入便签内容...", "Enter memo content...", "Unesi sadržaj bilješke...")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm min-h-32 bg-white"
                    autoFocus
                  />
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={async () => {
                        const m = memoDraft.trim();
                        setModal(null);
                        if (m) {
                          await handlePreview(modal.modeId, { memo_text: m });
                        } else {
                          await handlePreview(modal.modeId);
                        }
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览便签", "Preview memo", "Pregledaj bilješku")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "countdown" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr("设置倒计时事件名称和日期", "Set countdown event name and date", "Postavi naziv i datum odbrojavanja")}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-ink mb-1.5">
                        {tr("事件名称", "Event Name", "Naziv događaja")}
                      </label>
                      <input
                        value={countdownName}
                        onChange={(e) => setCountdownName(e.target.value)}
                        placeholder={tr("例如：元旦、生日", "e.g., New Year, Birthday", "npr. Nova godina, rođendan")}
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink mb-1.5">
                        {tr("目标日期", "Target Date", "Ciljani datum")}
                      </label>
                      <input
                        type="date"
                        value={countdownDate}
                        onChange={(e) => setCountdownDate(e.target.value)}
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId, {});
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={async () => {
                        setModal(null);
                        const today = new Date();
                        const target = new Date(countdownDate);
                        const days = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        await handlePreview(modal.modeId, {
                          events: [{
                            name: countdownName || tr("倒计时", "Countdown", "Odbrojavanje"),
                            date: countdownDate,
                            type: "countdown",
                            days: days
                          }]
                        });
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览倒计时", "Preview Countdown", "Pregledaj odbrojavanje")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "habit" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr("设置你的习惯并勾选完成情况", "Set your habits and check completion", "Postavi navike i označi završeno")}
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {habitItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={(e) => {
                            const newItems = [...habitItems];
                            newItems[idx].done = e.target.checked;
                            setHabitItems(newItems);
                          }}
                          className="w-4 h-4"
                        />
                        <input
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...habitItems];
                            newItems[idx].name = e.target.value;
                            setHabitItems(newItems);
                          }}
                          placeholder={tr("习惯名称", "Habit name", "Naziv navike")}
                          className="flex-1 rounded-xl border border-ink/20 px-3 py-1.5 text-sm bg-white"
                        />
                        <button
                          onClick={() => {
                            const newItems = habitItems.filter((_, i) => i !== idx);
                            setHabitItems(newItems);
                          }}
                          className="text-ink-light hover:text-red-500 px-2"
                          title={tr("删除", "Delete", "Izbriši")}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setHabitItems([...habitItems, { name: "", done: false }]);
                    }}
                    className="w-full mt-2 px-3 py-2 rounded-xl border border-dashed border-ink/20 text-sm text-ink-light hover:text-ink hover:border-ink/40 transition-colors"
                  >
                    + {tr("添加习惯", "Add Habit", "Dodaj naviku")}
                  </button>
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId, {
                          habitItems: habitItems,
                        });
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览打卡", "Preview Habits", "Pregledaj navike")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "lifebar" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr("设置你的年龄和预期寿命", "Set your age and life expectancy", "Postavi svoju dob i očekivani životni vijek")}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-ink mb-1.5">
                        {tr("芳龄几何？", "Your Age", "Tvoja dob")}
                      </label>
                      <input
                        type="number"
                        value={userAge}
                        onChange={(e) => setUserAge(parseInt(e.target.value) || 0)}
                        min="0"
                        max="120"
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink mb-1.5">
                        {tr("退休金领到？", "Life Expectancy", "Očekivani životni vijek")}
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLifeExpectancy(100)}
                          className={`flex-1 px-3 py-2 rounded-xl text-sm transition-colors ${
                            lifeExpectancy === 100
                              ? "bg-ink text-white"
                              : "bg-paper-dark text-ink hover:bg-ink/10"
                          }`}
                        >
                          100 {tr("岁", "years", "godina")}
                        </button>
                        <button
                          onClick={() => setLifeExpectancy(120)}
                          className={`flex-1 px-3 py-2 rounded-xl text-sm transition-colors ${
                            lifeExpectancy === 120
                              ? "bg-ink text-white"
                              : "bg-paper-dark text-ink hover:bg-ink/10"
                          }`}
                        >
                          120 {tr("岁", "years", "godina")}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={async () => {
                        setModal(null);
                        const lifePct = ((userAge / lifeExpectancy) * 100).toFixed(1);
                        await handlePreview(modal.modeId, {
                          age: userAge,
                          life_expect: lifeExpectancy,
                          life_pct: parseFloat(lifePct),
                          life_label: tr("人生", "Life", "Život")
                        });
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览进度", "Preview Progress", "Pregledaj napredak")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "calendar" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr(
                      "为日历中的特定日期添加提醒事项，提醒会显示在日期下方。",
                      "Add reminders for specific dates. They appear below each date in the calendar.",
                      "Dodaj podsjetnike za određene datume. Prikazat će se ispod datuma u kalendaru.",
                    )}
                  </div>
                  <CalendarReminders
                    reminders={calendarReminders}
                    onChange={setCalendarReminders}
                    tr={(zh, en) => tr(zh, en)}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("跳过预览", "Skip Preview", "Preskoči pregled")}
                    </Button>
                    <Button
                      onClick={async () => {
                        setModal(null);
                        const override: Record<string, unknown> = {};
                        if (Object.keys(calendarReminders).length > 0) {
                          override.reminders = calendarReminders;
                        }
                        await handlePreview(modal.modeId, override);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览日历", "Preview Calendar", "Pregledaj kalendar")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "timetable" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr(
                      "选择课表类型并编辑课程安排，点击单元格即可修改。",
                      "Choose timetable type and edit courses. Click any cell to modify.",
                      "Odaberi vrstu rasporeda i uredi predmete. Klikni bilo koje polje za izmjenu.",
                    )}
                  </div>
                  <TimetableEditor
                    data={timetableData}
                    onChange={setTimetableData}
                    tr={(zh, en) => tr(zh, en)}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={async () => {
                        setModal(null);
                        await handlePreview(modal.modeId, {
                          style: timetableData.style,
                          periods: timetableData.periods,
                          courses: timetableData.courses,
                        });
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览课程表", "Preview Timetable", "Pregledaj raspored")}
                    </Button>
                  </div>
                </>
              ) : modal.type === "bf6" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr(
                      "输入 Battlefield 6 用户名并选择平台。",
                      "Enter Battlefield 6 username and choose platform.",
                      "Unesi Battlefield 6 korisničko ime i odaberi platformu.",
                    )}
                  </div>
                  <div className="space-y-3">
                    <input
                      value={bf6UsernameDraft}
                      onChange={(e) => setBf6UsernameDraft(e.target.value)}
                      placeholder={tr("例如：shroud", "e.g. shroud", "npr. shroud")}
                      className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                      autoFocus
                    />
                    <select
                      value={bf6PlatformDraft}
                      onChange={(e) => setBf6PlatformDraft(e.target.value)}
                      className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                    >
                      <option value="pc">PC</option>
                      <option value="xbox">Xbox (generic)</option>
                      <option value="xboxseries">Xbox Series</option>
                      <option value="xboxone">Xbox One</option>
                      <option value="psn">PlayStation (generic)</option>
                      <option value="ps5">PlayStation 5</option>
                      <option value="ps4">PlayStation 4</option>
                    </select>
                  </div>
                  <div className="flex justify-end pt-3">
                    <Button
                      onClick={async () => {
                        const username = bf6UsernameDraft.trim();
                        setModal(null);
                        await handlePreview(
                          modal.modeId,
                          username ? { bf6_username: username, bf6_platform: bf6PlatformDraft } : {},
                        );
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览 BF6 档案", "Preview BF6 Profile", "Pregledaj BF6 profil")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <Dialog open={showCustomModeModal} onClose={() => setShowCustomModeModal(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader onClose={() => setShowCustomModeModal(false)}>
            <div>
              <DialogTitle>{tr("创建自定义小组件", "Create Custom Widget", "Izradi prilagođeni widget")}</DialogTitle>
              <DialogDescription>
                {tr(
                  "用一句话描述你想要的小组件，点击 AI 生成预览即可。",
                  "Describe the widget you want, then click AI Generate Preview.",
                  "U jednoj rečenici opiši widget koji želiš, zatim klikni AI Generate Preview.",
                )}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            {customGenerating ? (
              <div className="rounded-xl border border-ink/10 bg-paper px-3 py-3 text-sm text-ink-light flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                {tr("小组件生成中...", "Generating widget...", "Generiram widget...")}
              </div>
            ) : null}

            <textarea
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={tr(
                "描述你想要的小组件，如：每天显示一个英语单词和释义，单词要大号字体居中",
                "Describe your widget, e.g. show one English word and definition daily with a large centered font",
                "Opiši svoj widget, npr. svakog dana prikaži jednu englesku riječ i definiciju velikim centriranim fontom",
              )}
              className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm resize-y bg-white"
              disabled={customGenerating}
            />

            <input
              value={customModeName}
              onChange={(e) => setCustomModeName(e.target.value)}
              placeholder={tr("小组件名称（例如：今日英语）", "Widget name (e.g. Daily English)", "Naziv widgeta (npr. Dnevni engleski)")}
              className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
              disabled={customGenerating}
            />

            <Button
              size="sm"
              onClick={() => void handleGenerateCustomModeAndPreview()}
              disabled={customGenerating || !customDesc.trim()}
            >
              {tr("AI 生成预览", "AI Generate Preview", "AI generiraj pregled")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Invitation-code dialog */}
      {showInviteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{tr("请输入邀请码", "Enter Invitation Code", "Unesi kod pozivnice")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-light">
                {tr(
                  "您的免费额度已用完。您可以输入邀请码获得50次免费LLM调用额度，也可以在设备配置中设置自己的 API key。",
                  "Your free quota has been exhausted. You can either enter an invitation code to get more free LLM calls, or configure your own API key in device settings.",
                  "Besplatna kvota je potrošena. Možeš unijeti kod pozivnice za dodatne besplatne LLM pozive ili postaviti vlastiti API ključ u postavkama uređaja.",
                )}
              </p>
              <div className="p-3 rounded-xl border border-ink/20 bg-paper-dark">
                <p className="text-xs text-ink-light mb-2">
                  {tr(
                    "💡 提示：如果您有自己的 API key，可以在个人信息中配置，这样就不会受到额度限制了。",
                    "💡 Tip: If you have your own API key, you can configure it in your profile to avoid quota limits.",
                    "💡 Savjet: ako imaš vlastiti API ključ, možeš ga postaviti u profilu i izbjeći ograničenja kvote.",
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowInviteModal(false);
                    router.push(withLocalePath(localeFromPathname(pathname || "/"), "/profile"));
                  }}
                  className="w-full text-xs"
                >
                  {tr("前往个人信息配置", "Go to Profile Settings", "Idi na postavke profila")}
                </Button>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  {tr("邀请码", "Invitation Code", "Kod pozivnice")}
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder={tr("请输入邀请码", "Enter invitation code", "Unesi kod pozivnice")}
                  className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !redeemingInvite) {
                      handleRedeemInviteCode();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteCode("");
                    setPendingPreviewMode(null);
                  }}
                  disabled={redeemingInvite}
                >
                  {tr("取消", "Cancel", "Odustani")}
                </Button>
                <Button onClick={handleRedeemInviteCode} disabled={redeemingInvite || !inviteCode.trim()}>
                  {redeemingInvite ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      {tr("兑换中...", "Redeeming...", "Iskorištavam...")}
                    </>
                  ) : (
                    tr("兑换", "Redeem", "Iskoristi")
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
