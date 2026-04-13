"use client";

import { useEffect, useState, useCallback, Suspense, useMemo, useRef, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DeviceInfo } from "@/components/config/device-info";
import { LocationPicker } from "@/components/config/location-picker";
import { ModeSelector } from "@/components/config/mode-selector";
import { EInkPreviewPanel } from "@/components/config/eink-preview-panel";
import { SurfaceLayoutDialog } from "@/components/config/surface-layout-dialog";
import { SurfacePlaylistEditor } from "@/components/config/surface-playlist-editor";
import { SurfaceScheduleEditor } from "@/components/config/surface-schedule-editor";
import { SurfaceCreateWizard } from "@/components/config/surface-create-wizard";
import {
  effectivePreviewSurfaceId,
  normalizePlaylist,
  validatePlaylist,
  validateScheduleNonOverlapping,
  type SurfacePlaybackMode,
  type SurfacePlaylistEntry,
  type SurfaceScheduleBlock,
} from "@/lib/surface-playback";
import {
  DEFAULT_PANEL_H,
  DEFAULT_PANEL_W,
  inksightBodySize,
} from "@/lib/inksight-chrome";
import { CalendarReminders } from "@/components/config/calendar-reminders";
import { TimetableEditor, type TimetableData } from "@/components/config/timetable-editor";
import { RefreshStrategyEditor } from "@/components/config/refresh-strategy-editor";
import { Field, StatCard } from "@/components/config/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Settings,
  Sliders,
  BarChart3,
  RefreshCw,
  Save,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Monitor,
  X,
  Users,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { authHeaders, fetchCurrentUser, onAuthChanged } from "@/lib/auth";
import { localeFromPathname, pickByLocale, withLocalePath } from "@/lib/i18n";
import {
  buildLocationValue,
  cleanLocationValue,
  describeLocation,
  extractLocationValue,
  locationsEqual,
  type LocationValue,
} from "@/lib/locations";
import {
  defaultModelForConfigApiKeysTab,
  modelsForConfigApiKeysTab,
} from "@/lib/user-config-llm-models";
import {
  buildGridSpec,
  modeSupportsSlotTypeLiteral,
  normalizeSurfaceGridSpec,
  sortSurfaceSlotsReadingOrder as sortSurfaceSlotsReadingOrderLib,
  type SurfaceGridSlot,
} from "@/lib/surface-layout";

interface UserDevice {
  mac: string;
  nickname: string;
  bound_at: string;
  last_seen: string | null;
  role?: string;
  status?: string;
}

interface DeviceMember {
  user_id: number;
  username: string;
  role: string;
  status: string;
  nickname?: string;
  created_at: string;
}

interface AccessRequestItem {
  id: number;
  mac: string;
  requester_user_id: number;
  requester_username: string;
  status: string;
  created_at: string;
}

type ModeCatalogItem = {
  mode_id: string;
  category: "core" | "more" | "custom" | string;
  source?: string;
  display_name?: string;
  description?: string;
  settings_schema?: ModeSettingSchemaItem[];
  /** Surface grid: which slot shapes this mode supports (from mode JSON). */
  supported_slot_types?: string[];
  i18n?: {
    zh?: { name?: string; tip?: string };
    en?: { name?: string; tip?: string };
    hr?: { name?: string; tip?: string };
  };
};

const STRATEGIES = {
  random: {
    zh: "从已启用的模式中随机选取",
    en: "Pick randomly from enabled modes",
    hr: "Nasumično biraj iz uključenih modova",
  },
  cycle: {
    zh: "按顺序循环切换已启用的模式",
    en: "Cycle through enabled modes in order",
    hr: "Kružno izmjenjuj uključene modove redom",
  },
  time_slot: {
    zh: "根据时间段显示不同内容模式",
    en: "Show different modes for different time slots",
    hr: "Prikaži različite modove po vremenskim blokovima",
  },
  smart: {
    zh: "根据时间段自动匹配最佳模式",
    en: "Automatically match the best mode by time of day",
    hr: "Automatski odaberi najbolji mod prema dobu dana",
  },
} as const;

const MODE_LANGUAGE_OPTIONS = [
  { value: "zh", label: "中文", labelEn: "Chinese", labelHr: "Kineski" },
  { value: "en", label: "English", labelEn: "English", labelHr: "Engleski" },
  { value: "hr", label: "Hrvatski", labelEn: "Croatian", labelHr: "Hrvatski" },
] as const;

const TONE_OPTIONS = [
  { value: "positive", label: "积极鼓励", labelEn: "Encouraging", labelHr: "Pozitivan" },
  { value: "neutral", label: "中性克制", labelEn: "Neutral", labelHr: "Neutralan" },
  { value: "deep", label: "深沉内省", labelEn: "Deep", labelHr: "Dubok" },
  { value: "humor", label: "轻松幽默", labelEn: "Humorous", labelHr: "Humorističan" },
] as const;
const PERSONA_PRESETS = [
  { zh: "鲁迅", en: "Lu Xun", hr: "Lu Xun" },
  { zh: "王小波", en: "Wang Xiaobo", hr: "Wang Xiaobo" },
  { zh: "JARVIS", en: "JARVIS", hr: "JARVIS" },
  { zh: "苏格拉底", en: "Socrates", hr: "Sokrat" },
  { zh: "村上春树", en: "Haruki Murakami", hr: "Haruki Murakami" },
] as const;

import { queueImmediateRefreshIfOnline } from "@/lib/device-utils";

function normalizeTone(v: unknown): string {
  if (typeof v !== "string") return "neutral";
  if (v === "positive" || v === "neutral" || v === "deep" || v === "humor") return v;
  const found = TONE_OPTIONS.find((x) => x.label === v || x.labelEn === v || x.labelHr === v);
  return found?.value || "neutral";
}

// Custom mode templates removed (AI-only creation)


const TABS = [
  { id: "modes", label: { zh: "模式", en: "Modes", hr: "Modovi" }, icon: Settings },
  { id: "surfaces", label: { zh: "Surfaces", en: "Surfaces", hr: "Surfaces" }, icon: RefreshCw },
  { id: "preferences", label: { zh: "个性化", en: "Preferences", hr: "Postavke" }, icon: Sliders },
  { id: "api_keys", label: { zh: "API Keys", en: "API Keys", hr: "API ključevi" }, icon: KeyRound },
  { id: "sharing", label: { zh: "共享成员", en: "Sharing", hr: "Dijeljenje" }, icon: Users },
  { id: "stats", label: { zh: "状态", en: "Status", hr: "Status" }, icon: BarChart3 },
] as const;

/**
 * Preset surfaces: MVP 2×2 grid only; topologies differ so Morning / Work / Home don’t look the same:
 * - Morning: two SMALL (row 0) + WIDE (row 1)
 * - Work: WIDE (row 0) + two SMALL (row 1)
 * - Home: TALL (col 0) + two SMALL stacked (col 1)
 */
const DEFAULT_SURFACE_LIBRARY = [
  {
    id: "morning",
    name: { zh: "晨间", en: "Morning", hr: "Jutro" },
    tip: {
      zh: "天气与今日一句，底部宽区放月历",
      en: "Weather + daily line; wide strip = month calendar",
      hr: "Vrijeme + dnevni red; široki red = kalendar mjeseca",
    },
    definition: {
      id: "morning",
      type: "surface",
      grid: { columns: 2, rows: 2, gap: 6, padding: 8 },
      slots: [
        { id: "top_left", x: 0, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "WEATHER" },
        { id: "top_right", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "DAILY" },
        { id: "bottom", x: 0, y: 1, w: 2, h: 1, slot_type: "WIDE", mode_id: "CALENDAR" },
      ],
      layout: [],
      refresh: { mode: "hybrid", interval: 300 },
      rules: [],
    },
  },
  {
    id: "work",
    name: { zh: "工作", en: "Work", hr: "Posao" },
    tip: {
      zh: "上方宽条简报，下方左日历右斯多葛",
      en: "Wide briefing strip on top; calendar + stoic in two tiles below",
      hr: "Široki briefing gore; kalendar + stoik u dva polja dolje",
    },
    definition: {
      id: "work",
      type: "surface",
      grid: { columns: 2, rows: 2, gap: 6, padding: 8 },
      slots: [
        { id: "top_wide", x: 0, y: 0, w: 2, h: 1, slot_type: "WIDE", mode_id: "BRIEFING" },
        { id: "bottom_left", x: 0, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "CALENDAR" },
        { id: "bottom_right", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "STOIC" },
      ],
      layout: [],
      refresh: { mode: "hybrid", interval: 300 },
      rules: [],
    },
  },
  {
    id: "home",
    name: { zh: "居家", en: "Home", hr: "Dom" },
    tip: {
      zh: "左侧长条天气，右侧上禅下诗",
      en: "Tall weather on the left; zen above + poetry below on the right",
      hr: "Visoko vrijeme lijevo; zen gore i poezija dolje desno",
    },
    definition: {
      id: "home",
      type: "surface",
      grid: { columns: 2, rows: 2, gap: 6, padding: 8 },
      slots: [
        { id: "left_tall", x: 0, y: 0, w: 1, h: 2, slot_type: "TALL", mode_id: "WEATHER" },
        { id: "right_top", x: 1, y: 0, w: 1, h: 1, slot_type: "SMALL", mode_id: "ZEN" },
        { id: "right_bottom", x: 1, y: 1, w: 1, h: 1, slot_type: "SMALL", mode_id: "POETRY" },
      ],
      layout: [],
      refresh: { mode: "polling", interval: 600 },
      rules: [],
    },
  },
] as const;

function legacyTypeToMode(t: string): string {
  const x = (t || "").toLowerCase();
  const map: Record<string, string> = {
    weather: "WEATHER",
    calendar: "CALENDAR",
    text: "DAILY",
    tasks: "BRIEFING",
    github: "BRIEFING",
    custom_api: "DAILY",
  };
  return map[x] || "STOIC";
}

function resolveSurfaceSlotMode(item: Record<string, unknown> | null | undefined): string {
  if (!item || typeof item !== "object") return "";
  const m = item.mode ?? item.mode_id ?? item.persona;
  if (typeof m === "string" && m.trim()) return m.trim().toUpperCase();
  const t = item.type;
  if (t !== undefined && t !== null && String(t).trim()) return legacyTypeToMode(String(t));
  return "";
}

function isPresetSurfaceId(surfaceId: string): boolean {
  return DEFAULT_SURFACE_LIBRARY.some((p) => p.id === surfaceId);
}

function surfacesPayloadFromCatalog(
  surfaceCatalog: Array<{ id: string; definition: Record<string, unknown> }>,
): Array<Record<string, unknown>> {
  return surfaceCatalog.map((surface) => ({ ...surface.definition, id: surface.id, type: "surface" }));
}

function surfaceHasEmptyGridSlot(def: Record<string, unknown> | null | undefined): boolean {
  if (!def || typeof def !== "object") return false;
  const slots = def.slots;
  if (!Array.isArray(slots)) return false;
  for (const raw of slots) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const mid = String(s.mode_id || s.mode || "").trim();
    if (!mid) return true;
  }
  return false;
}

/** Surface uses fixed grid + slots (spec); legacy surfaces use layout[].position only. */
function surfaceUsesGridSlots(def: Record<string, unknown> | null | undefined): boolean {
  if (!def || typeof def !== "object") return false;
  const slots = def.slots;
  const grid = def.grid;
  return Array.isArray(slots) && slots.length > 0 && grid !== null && typeof grid === "object";
}

const sortSurfaceSlotsReadingOrder = sortSurfaceSlotsReadingOrderLib;

function gridStyleFromSurfaceDefinition(def: Record<string, unknown>): CSSProperties {
  const g = def.grid as { columns?: number; rows?: number; gap?: number; padding?: number } | undefined;
  const norm = normalizeSurfaceGridSpec(g);
  const cols = norm.columns;
  const rows = norm.rows;
  const gap = norm.gap;
  const pad = norm.padding;
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    gap: `${gap}px`,
    padding: `${pad}px`,
    aspectRatio: "4 / 3",
    width: "100%",
    minHeight: "260px",
    maxHeight: "min(52vh, 420px)",
  };
}

const SURFACE_PREVIEW_W = 400;
const SURFACE_PREVIEW_H = 300;

/** Legacy CSS mosaic when a surface has no grid+slots (position top/middle/bottom only). */
function legacySurfaceMosaicGridStyle(surfaceId: string): CSSProperties {
  const base: CSSProperties = {
    display: "grid",
    gap: "8px",
    aspectRatio: "4 / 3",
    width: "100%",
    minHeight: "260px",
    maxHeight: "min(52vh, 420px)",
  };
  switch (surfaceId) {
    case "morning":
      return {
        ...base,
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gridTemplateAreas: `"top middle" "bottom bottom"`,
      };
    case "work":
      return {
        ...base,
        gridTemplateColumns: "1.2fr 0.85fr",
        gridTemplateRows: "1fr 1.1fr",
        gridTemplateAreas: `"a b" "c c"`,
      };
    case "home":
      return {
        ...base,
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr auto",
        gridTemplateAreas: `"w t t" "w t t" "bot bot bot"`,
      };
    default:
      return {
        ...base,
        gridTemplateColumns: "1fr",
        gridTemplateRows: "repeat(3, minmax(52px, 1fr))",
      };
  }
}

function surfaceSlotGridArea(surfaceId: string, slot: "top" | "middle" | "bottom"): string | undefined {
  if (surfaceId === "work") {
    if (slot === "top") return "a";
    if (slot === "middle") return "b";
    return "c";
  }
  if (surfaceId === "home") {
    if (slot === "top") return "w";
    if (slot === "middle") return "t";
    return "bot";
  }
  if (surfaceId === "morning") {
    return slot;
  }
  return undefined;
}

type SurfaceSlotModalState =
  | { kind: "grid"; surfaceId: string; slotId: string }
  | { kind: "legacy"; surfaceId: string; position: "top" | "middle" | "bottom" };

type SurfaceSlotEditTarget =
  | { type: "grid"; slotId: string }
  | { type: "legacy"; position: "top" | "middle" | "bottom" };

type TabId = (typeof TABS)[number]["id"];

interface DeviceConfig {
  mac?: string;
  modes?: string[];
  refreshStrategy?: string;
  refreshInterval?: number;
  refresh_strategy?: string;
  refresh_minutes?: number;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  admin1?: string;
  country?: string;
  language?: string;
  contentTone?: string;
  content_tone?: string;
  characterTones?: string[];
  character_tones?: string[];
  llmProvider?: string;
  llmModel?: string;
  llm_provider?: string;
  llm_model?: string;
  imageProvider?: string;
  imageModel?: string;
  image_provider?: string;
  image_model?: string;
  countdownEvents?: { name: string; date: string }[];
  countdown_events?: { name: string; date: string }[];
  memoText?: string;
  memo_text?: string;
  mode_overrides?: Record<string, ModeOverride>;
  modeOverrides?: Record<string, ModeOverride>;
  deviceMode?: "mode" | "surface";
  device_mode?: "mode" | "surface";
  assignedMode?: string;
  assigned_mode?: string;
  assignedSurface?: string;
  assigned_surface?: string;
  surfaces?: Array<Record<string, unknown>>;
  surfacePlaylist?: SurfacePlaylistEntry[];
  surfacePlaybackMode?: SurfacePlaybackMode;
  surface_playback_mode?: SurfacePlaybackMode;
  surfaceSchedule?: Array<Record<string, unknown>>;
  is_focus_listening?: boolean;
  focus_listening?: number;
  is_always_active?: boolean;
  always_active?: number | boolean;
}

interface ModeOverride {
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  admin1?: string;
  country?: string;
  llm_provider?: string;
  llm_model?: string;
  [key: string]: unknown;
}

interface PendingPreviewConfirm {
  mode: string;
  forceNoCache: boolean;
  forcedModeOverride?: ModeOverride;
  usageSource?: string;
}

type ParamModalType = "quote" | "weather" | "memo" | "countdown" | "habit" | "lifebar" | "calendar" | "timetable" | "bf6";
interface ParamModalState {
  type: ParamModalType;
  mode: string;
  action: "preview" | "apply";
}

interface ModeSettingSchemaItem {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "boolean";
  placeholder?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  as_json?: boolean;
  options?: Array<{ value: string; label: string } | string>;
}

interface DeviceStats {
  total_renders?: number;
  cache_hit_rate?: number;
  last_battery_voltage?: number;
  last_rssi?: number;
  last_refresh?: string;
  error_count?: number;
  mode_frequency?: Record<string, number>;
}

interface UserProfileLlmConfig {
  llm_access_mode?: "preset" | "custom_openai";
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
}

interface UserProfileResponse {
  free_quota_remaining?: number;
  llm_config?: UserProfileLlmConfig | null;
  llm_config_updated_at?: string;
}

type RuntimeMode = "active" | "interval" | "unknown";

function ConfigPageInner() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const isEn = locale !== "zh";
  const tr = useCallback((zh: string, en: string, hr = en) => pickByLocale(locale, { zh, en, hr }), [locale]);
  const defaultCityName = useMemo(
    () => pickByLocale(locale, { zh: "杭州", en: "Hangzhou", hr: "Zagreb" }),
    [locale],
  );
  const searchParams = useSearchParams();
  const mac = searchParams.get("mac") || "";
  const preferMac = searchParams.get("prefer_mac") || "";
  const prefillCode = searchParams.get("code") || "";
  const [currentUser, setCurrentUser] = useState<{ user_id: number; username: string } | null | undefined>(undefined);
  const [userDevices, setUserDevices] = useState<UserDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [pairCodeInput, setPairCodeInput] = useState("");
  const [pairingDevice, setPairingDevice] = useState(false);
  const [bindMacInput, setBindMacInput] = useState("");
  const [bindNicknameInput, setBindNicknameInput] = useState("");
  const [deviceMembers, setDeviceMembers] = useState<DeviceMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AccessRequestItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [shareUsernameInput, setShareUsernameInput] = useState("");
  const [macAccessDenied, setMacAccessDenied] = useState(false);

  const refreshCurrentUser = useCallback(() => {
    fetchCurrentUser()
      .then((d) => setCurrentUser(d ? { user_id: d.user_id, username: d.username } : null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    refreshCurrentUser();
  }, [refreshCurrentUser]);

  useEffect(() => {
    const off = onAuthChanged(refreshCurrentUser);
    const onFocus = () => refreshCurrentUser();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCurrentUser]);

  const loadUserDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch("/api/user/devices", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUserDevices(data.devices || []);
      }
    } catch { /* ignore */ }
    finally { setDevicesLoading(false); }
  }, []);

  const loadPendingRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch("/api/user/devices/requests", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.requests || []);
      }
    } catch { /* ignore */ }
    finally { setRequestsLoading(false); }
  }, []);

  const loadDeviceMembers = useCallback(async (deviceMac: string) => {
    if (!deviceMac) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/user/devices/${encodeURIComponent(deviceMac)}/members`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceMembers(data.members || []);
      } else {
        setDeviceMembers([]);
      }
    } catch {
      setDeviceMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUserDevices();
      loadPendingRequests();
    }
  }, [currentUser, loadPendingRequests, loadUserDevices]);

  useEffect(() => {
    if (mac) return;
    const normalizedCode = prefillCode.trim().toUpperCase();
    if (normalizedCode) {
      setPairCodeInput((prev) => prev || normalizedCode);
    }
    const normalizedMac = preferMac.trim().toUpperCase();
    if (normalizedMac) {
      setBindMacInput((prev) => prev || normalizedMac);
    }
  }, [mac, preferMac, prefillCode]);

  useEffect(() => {
    if (mac || !preferMac || !currentUser || devicesLoading) return;
    const normalizedMac = preferMac.trim().toUpperCase();
    if (!normalizedMac) return;
    const alreadyBound = userDevices.some((item) => item.mac.toUpperCase() === normalizedMac);
    if (alreadyBound) {
      window.location.href = `${withLocalePath(locale, "/config")}?mac=${encodeURIComponent(normalizedMac)}`;
    }
  }, [currentUser, devicesLoading, locale, mac, preferMac, userDevices]);

  const handlePairDevice = async () => {
    const normalized = pairCodeInput.trim().toUpperCase();
    if (!normalized) return;
    setPairingDevice(true);
    try {
      const res = await fetch("/api/claim/consume", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pair_code: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || tr("配对失败", "Pairing failed"), "error");
        return;
      }
      setPairCodeInput("");
      if (data.status === "claimed" || data.status === "already_member" || data.status === "active") {
        await loadUserDevices();
        await loadPendingRequests();
        window.location.href = `${withLocalePath(locale, "/config")}?mac=${encodeURIComponent(data.mac)}`;
        return;
      }
      await loadPendingRequests();
      showToast(tr("已提交绑定申请，等待 owner 同意", "Binding request submitted. Waiting for owner approval"), "info");
    } catch {
      showToast(tr("配对失败", "Pairing failed"), "error");
    } finally {
      setPairingDevice(false);
    }
  };

  const handleBindDevice = async (deviceMac: string, nickname?: string) => {
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ mac: deviceMac, nickname: nickname || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || tr("绑定失败", "Binding failed"), "error");
        return null;
      }
      setBindMacInput("");
      setBindNicknameInput("");
      await loadUserDevices();
      await loadPendingRequests();
      return data;
    } catch {
      showToast(tr("绑定失败", "Binding failed"), "error");
      return null;
    }
  };

  const handleUnbindDevice = async (deviceMac: string) => {
    try {
      const res = await fetch(`/api/user/devices/${encodeURIComponent(deviceMac)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) await loadUserDevices();
    } catch { /* ignore */ }
  };

  const handleApproveRequest = async (requestId: number) => {
    try {
      const res = await fetch(`/api/user/devices/requests/${requestId}/approve`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: "{}",
      });
      if (res.ok) {
        await loadPendingRequests();
        if (mac) await loadDeviceMembers(mac);
        showToast(tr("已同意绑定请求", "Binding request approved"), "success");
      } else {
        showToast(tr("同意失败", "Approval failed"), "error");
      }
    } catch {
      showToast(tr("同意失败", "Approval failed"), "error");
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    try {
      const res = await fetch(`/api/user/devices/requests/${requestId}/reject`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: "{}",
      });
      if (res.ok) {
        await loadPendingRequests();
        showToast(tr("已拒绝绑定请求", "Binding request rejected"), "success");
      } else {
        showToast(tr("拒绝失败", "Rejection failed"), "error");
      }
    } catch {
      showToast(tr("拒绝失败", "Rejection failed"), "error");
    }
  };

  const handleShareDevice = async () => {
    if (!mac || !shareUsernameInput.trim()) return;
    try {
      const res = await fetch(`/api/user/devices/${encodeURIComponent(mac)}/share`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ username: shareUsernameInput.trim() }),
      });
      if (!res.ok) throw new Error("share failed");
      setShareUsernameInput("");
      await loadDeviceMembers(mac);
      await loadPendingRequests();
      showToast(tr("分享成功", "Shared successfully"), "success");
    } catch {
      showToast(tr("分享失败", "Share failed"), "error");
    }
  };

  const handleRemoveMember = async (targetUserId: number) => {
    if (!mac) return;
    try {
      const res = await fetch(`/api/user/devices/${encodeURIComponent(mac)}/members/${targetUserId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("remove failed");
      await loadDeviceMembers(mac);
      showToast(tr("成员已移除", "Member removed"), "success");
    } catch {
      showToast(tr("移除成员失败", "Failed to remove member"), "error");
    }
  };

  const [activeTab, setActiveTab] = useState<TabId>("modes");
  const [config, setConfig] = useState<DeviceConfig>({});
  const [selectedModes, setSelectedModes] = useState<Set<string>>(new Set(["STOIC", "ZEN", "DAILY"]));
  const [surfacePlaybackMode, setSurfacePlaybackMode] = useState<SurfacePlaybackMode>("single");
  const [surfacePlaylist, setSurfacePlaylist] = useState<SurfacePlaylistEntry[]>([
    { surface_id: "work", enabled: true, duration_sec: 300, order: 0 },
  ]);
  const [surfaceSchedule, setSurfaceSchedule] = useState<SurfaceScheduleBlock[]>([]);
  const [surfaceCreateWizardOpen, setSurfaceCreateWizardOpen] = useState(false);
  const [strategy, setStrategy] = useState("random");
  const [refreshMin, setRefreshMin] = useState(60);
  const [deviceRenderMode, setDeviceRenderMode] = useState<"mode" | "surface">("mode");
  const [assignedLegacyMode, setAssignedLegacyMode] = useState("");
  const [assignedSurface, setAssignedSurface] = useState("");
  const [surfacePreviewTarget, setSurfacePreviewTarget] = useState("");
  /** Surface whose layout editor is open (grid+slots or legacy top/middle/bottom). */
  const [surfaceLayoutEditorId, setSurfaceLayoutEditorId] = useState("");
  const [surfaceSlotModal, setSurfaceSlotModal] = useState<SurfaceSlotModalState | null>(null);
  const [surfaceSlotModalMode, setSurfaceSlotModalMode] = useState<string>("STOIC");
  const [surfaceSlotModalMemo, setSurfaceSlotModalMemo] = useState("");
  const [surfaceDrafts, setSurfaceDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [surfaceLayoutDialogOpen, setSurfaceLayoutDialogOpen] = useState(false);
  const [surfacePreviewImg, setSurfacePreviewImg] = useState<string | null>(null);
  const [surfacePreviewLoading, setSurfacePreviewLoading] = useState(false);
  const [surfacePreviewStatusText, setSurfacePreviewStatusText] = useState("");
  const [surfaceApplyToScreenLoading, setSurfaceApplyToScreenLoading] = useState(false);
  const [city, setCity] = useState("");
  const [locationMeta, setLocationMeta] = useState<LocationValue>({});
  const [modeLanguage, setModeLanguage] = useState("zh");
  const [contentTone, setContentTone] = useState("neutral");
  const [characterTones, setCharacterTones] = useState<string[]>([]);
  const [customPersonaTone, setCustomPersonaTone] = useState("");
  const [modeOverrides, setModeOverrides] = useState<Record<string, ModeOverride>>({});
  const [settingsMode, setSettingsMode] = useState<string | null>(null);
  const [settingsJsonDrafts, setSettingsJsonDrafts] = useState<Record<string, string>>({});
  const [settingsJsonErrors, setSettingsJsonErrors] = useState<Record<string, string>>({});
  const [memoText, setMemoText] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStatusText, setPreviewStatusText] = useState("");
  const [previewMode, setPreviewMode] = useState("");
  const [previewColors, setPreviewColors] = useState(2);
  const [previewNoCacheOnce, setPreviewNoCacheOnce] = useState(false);
  const [previewCacheHit, setPreviewCacheHit] = useState<boolean | null>(null);
  const [previewLlmStatus, setPreviewLlmStatus] = useState<string | null>(null);
  const [previewConfirm, setPreviewConfirm] = useState<PendingPreviewConfirm | null>(null);

  // Local image picker + upload flow for MY_ADAPTIVE, shared with /preview.
  const adaptiveFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAdaptiveAction, setPendingAdaptiveAction] = useState<null | { action: "preview" | "apply"; mode: string }>(null);
  const [, setAdaptiveUploading] = useState(false);

  // Parameter modal, intentionally aligned with the /preview experience.
  const [paramModal, setParamModal] = useState<ParamModalState | null>(null);
  const [quoteDraft, setQuoteDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [weatherDraftLocation, setWeatherDraftLocation] = useState<LocationValue>({});
  const [bf6UsernameDraft, setBf6UsernameDraft] = useState("");
  const [bf6PlatformDraft, setBf6PlatformDraft] = useState("pc");
  const [memoDraft, setMemoDraft] = useState("");
  const [countdownName, setCountdownName] = useState(
    pickByLocale(locale, { zh: "元旦", en: "New Year", hr: "Nova Godina" }),
  );
  const [countdownDate, setCountdownDate] = useState("2027-01-01");
  const [habitItems, setHabitItems] = useState(
    locale === "zh"
      ? [{ name: "早起", done: false }, { name: "运动", done: false }, { name: "阅读", done: false }]
      : locale === "hr"
      ? [{ name: "Rano ustajanje", done: false }, { name: "Vježbanje", done: false }, { name: "Čitanje", done: false }]
      : [{ name: "Wake up early", done: false }, { name: "Exercise", done: false }, { name: "Read", done: false }],
  );
  const [userAge, setUserAge] = useState(30);
  const [lifeExpectancy, setLifeExpectancy] = useState<100 | 120>(100);
  const [timetableData, setTimetableData] = useState<TimetableData>({
    style: "weekly",
    periods: ["08:00-09:30", "10:00-11:30", "14:00-15:30", "16:00-17:30"],
    courses: isEn
      ? {
          "0-0": "Calculus/A201", "0-2": "Linear Algebra/A201",
          "1-1": "English/B305", "1-3": "PE/Gym",
          "2-0": "Data Struct/C102", "2-2": "Networks/C102",
          "3-1": "Probability/A201", "3-3": "Politics/D405",
          "4-0": "OS/C102",
        }
      : {
          "0-0": "高等数学/A201", "0-2": "线性代数/A201",
          "1-1": "大学英语/B305", "1-3": "体育/操场",
          "2-0": "数据结构/C102", "2-2": "计算机网络/C102",
          "3-1": "概率论/A201", "3-3": "毛概/D405",
          "4-0": "操作系统/C102",
        },
  });
  // Invitation-code modal state.
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingInvite, setRedeemingInvite] = useState(false);
  const [pendingPreviewMode, setPendingPreviewMode] = useState<string | null>(null);
  const [, setCurrentMode] = useState<string>("");
  const [applyToScreenLoading, setApplyToScreenLoading] = useState(false);
  const [, setFavoritedModes] = useState<Set<string>>(new Set());
  const favoritesLoadedMacRef = useRef<string>("");
  const memoSettingsInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewStreamRef = useRef<EventSource | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const surfacePreviewObjectUrlRef = useRef<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("unknown");
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [isFocusListening, setIsFocusListening] = useState(false);
  const [alwaysActive, setAlwaysActive] = useState(false);
  const [focusToggleLoading, setFocusToggleLoading] = useState(false);
  const [focusAlertToken, setFocusAlertToken] = useState<string>("");
  const [showFocusTokenModal, setShowFocusTokenModal] = useState(false);

  const [customDesc, setCustomDesc] = useState("");
  const [customModeName, setCustomModeName] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [customGenerating, setCustomGenerating] = useState(false);
  const [customPreviewImg, setCustomPreviewImg] = useState<string | null>(null);
  const [, setCustomPreviewLoading] = useState(false);
  const [editingCustomMode, setEditingCustomMode] = useState(false);
  const [customEditorSource, setCustomEditorSource] = useState<"ai" | "manual" | null>(null);
  const [previewModeLabelOverride, setPreviewModeLabelOverride] = useState<string | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const surfacePanelRef = useRef<HTMLDivElement | null>(null);

  const [catalogItems, setCatalogItems] = useState<ModeCatalogItem[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  const [apiKeysRemoving, setApiKeysRemoving] = useState(false);
  const [freeQuotaRemaining, setFreeQuotaRemaining] = useState<number | null>(null);
  const [llmAccessModeDraft, setLlmAccessModeDraft] = useState<"preset" | "custom_openai">("preset");
  const [apiModelDraft, setApiModelDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiBaseUrlDraft, setApiBaseUrlDraft] = useState("https://api.openai.com/v1");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyTesting, setApiKeyTesting] = useState(false);
  const [apiKeysUpdatedAt, setApiKeysUpdatedAt] = useState("");

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadUserApiKeys = useCallback(async () => {
    if (!currentUser) return;
    setApiKeysLoading(true);
    try {
      const res = await fetch("/api/user/profile", { headers: authHeaders() });
      if (!res.ok) throw new Error("profile load failed");
      const data = (await res.json()) as UserProfileResponse;
      setFreeQuotaRemaining(typeof data.free_quota_remaining === "number" ? data.free_quota_remaining : null);
      setApiKeysUpdatedAt(data.llm_config_updated_at || "");
      const cfg = data.llm_config;
      if (!cfg) {
        setLlmAccessModeDraft("preset");
        setApiModelDraft("deepseek-chat");
        setApiKeyDraft("");
        setApiBaseUrlDraft("https://api.openai.com/v1");
        return;
      }
      const mode = (cfg.llm_access_mode || "preset") as "preset" | "custom_openai";
      setLlmAccessModeDraft(mode);
      if (mode === "custom_openai") {
        setApiModelDraft(cfg.model || "gpt-4o-mini");
        setApiBaseUrlDraft(cfg.base_url || "https://api.openai.com/v1");
      } else {
        setApiModelDraft(cfg.model || "deepseek-chat");
        setApiBaseUrlDraft("https://api.openai.com/v1");
      }
      setApiKeyDraft(cfg.api_key || "");
    } catch {
      showToast(tr("加载 API Keys 失败", "Failed to load API keys", "Učitavanje API ključeva nije uspjelo"), "error");
    } finally {
      setApiKeysLoading(false);
    }
  }, [currentUser, showToast, tr]);

  const saveUserApiKeys = useCallback(async () => {
    if (!currentUser) return;
    setApiKeysSaving(true);
    try {
      const isOpenAiMode = llmAccessModeDraft === "custom_openai";
      const body = isOpenAiMode
        ? {
            llm_access_mode: "custom_openai",
            provider: "openai_compat",
            model: apiModelDraft.trim() || "gpt-4o-mini",
            api_key: apiKeyDraft.trim(),
            base_url: apiBaseUrlDraft.trim() || "https://api.openai.com/v1",
            image_provider: "",
            image_model: "",
            image_api_key: "",
            image_base_url: "",
          }
        : {
            llm_access_mode: "preset",
            provider: "deepseek",
            model: apiModelDraft.trim() || "deepseek-chat",
            api_key: apiKeyDraft.trim(),
            base_url: "",
            image_provider: "",
            image_model: "",
            image_api_key: "",
            image_base_url: "",
          };

      const res = await fetch("/api/user/profile/llm", {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "save failed");
      showToast(
        tr("API Keys 已保存，后续将优先使用你的 Key", "API keys saved. Your key will be used first.", "API ključevi su spremljeni. Tvoj ključ će se koristiti prioritetno."),
        "success",
      );
      await loadUserApiKeys();
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : tr("保存 API Keys 失败", "Failed to save API keys", "Spremanje API ključeva nije uspjelo"),
        "error",
      );
    } finally {
      setApiKeysSaving(false);
    }
  }, [currentUser, llmAccessModeDraft, apiModelDraft, apiKeyDraft, apiBaseUrlDraft, showToast, tr, loadUserApiKeys]);

  const removeUserApiKeys = useCallback(async () => {
    if (!currentUser) return;
    setApiKeysRemoving(true);
    try {
      const res = await fetch("/api/user/profile/llm", {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "delete failed");
      showToast(
        tr("已移除 API Keys，系统将使用免费额度", "API keys removed. Free quota will be used.", "API ključevi su uklonjeni. Koristit će se besplatna kvota."),
        "success",
      );
      await loadUserApiKeys();
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : tr("移除 API Keys 失败", "Failed to remove API keys", "Uklanjanje API ključeva nije uspjelo"),
        "error",
      );
    } finally {
      setApiKeysRemoving(false);
    }
  }, [currentUser, showToast, tr, loadUserApiKeys]);

  const testUserApiKeys = useCallback(async () => {
    if (!currentUser) return;
    if (!apiKeyDraft.trim()) {
      showToast(tr("请先输入 API Key", "Please enter API key first", "Prvo unesi API ključ"), "error");
      return;
    }
    setApiKeyTesting(true);
    try {
      const isOpenAiMode = llmAccessModeDraft === "custom_openai";
      const payload = isOpenAiMode
        ? {
            llm_access_mode: "custom_openai",
            provider: "openai_compat",
            model: apiModelDraft.trim() || "gpt-4o-mini",
            api_key: apiKeyDraft.trim(),
            base_url: apiBaseUrlDraft.trim() || "https://api.openai.com/v1",
          }
        : {
            llm_access_mode: "preset",
            provider: "deepseek",
            model: apiModelDraft.trim() || "deepseek-chat",
            api_key: apiKeyDraft.trim(),
          };

      const res = await fetch("/api/user/profile/llm/test", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "test failed");
      showToast(
        tr("连接测试成功", "Connection test successful", "Test povezivanja je uspješan"),
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : tr("连接测试失败", "Connection test failed", "Test povezivanja nije uspio"),
        "error",
      );
    } finally {
      setApiKeyTesting(false);
    }
  }, [currentUser, apiKeyDraft, llmAccessModeDraft, apiModelDraft, apiBaseUrlDraft, showToast, tr]);

  useEffect(() => {
    if (currentUser) {
      void loadUserApiKeys();
    }
  }, [currentUser, loadUserApiKeys]);

  const prevLlmAccessTabModeRef = useRef<"preset" | "custom_openai" | null>(null);
  useEffect(() => {
    if (prevLlmAccessTabModeRef.current === null) {
      prevLlmAccessTabModeRef.current = llmAccessModeDraft;
      return;
    }
    if (prevLlmAccessTabModeRef.current === llmAccessModeDraft) return;
    prevLlmAccessTabModeRef.current = llmAccessModeDraft;
    const opts = modelsForConfigApiKeysTab(llmAccessModeDraft);
    setApiModelDraft((prev) =>
      opts.includes(prev) ? prev : defaultModelForConfigApiKeysTab(llmAccessModeDraft),
    );
  }, [llmAccessModeDraft]);

  const currentLocation = useMemo(
    () => buildLocationValue(city, locationMeta),
    [city, locationMeta],
  );
  const defaultWeatherLocation = useMemo(
    () => (currentLocation.city ? cleanLocationValue(currentLocation) : buildLocationValue(defaultCityName)),
    [currentLocation, defaultCityName],
  );

  const applyGlobalLocation = useCallback((next: Partial<LocationValue> | null | undefined) => {
    const cleaned = cleanLocationValue(next);
    setCity(cleaned.city || "");
    setLocationMeta(cleaned);
  }, []);

  const setGlobalTimezone = useCallback((timezone: string) => {
    setLocationMeta((prev) => cleanLocationValue({ ...(prev || {}), timezone }));
  }, []);

  const replacePreviewImg = useCallback((nextUrl: string | null) => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    if (nextUrl) previewObjectUrlRef.current = nextUrl;
    setPreviewImg(nextUrl);
  }, []);

  const replaceSurfacePreviewImg = useCallback((nextUrl: string | null) => {
    if (surfacePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(surfacePreviewObjectUrlRef.current);
      surfacePreviewObjectUrlRef.current = null;
    }
    if (nextUrl) surfacePreviewObjectUrlRef.current = nextUrl;
    setSurfacePreviewImg(nextUrl);
  }, []);

  const uploadLocalImage = useCallback(async (file: File): Promise<string> => {
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
  }, []);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      if (surfacePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(surfacePreviewObjectUrlRef.current);
        surfacePreviewObjectUrlRef.current = null;
      }
    };
  }, []);

  const nextConfigPath = useMemo(() => {
    const params = new URLSearchParams();
    if (mac) {
      params.set("mac", mac);
    } else {
      if (preferMac) params.set("prefer_mac", preferMac);
      if (prefillCode) params.set("code", prefillCode);
    }
    const query = params.toString();
    return query ? `${withLocalePath(locale, "/config")}?${query}` : withLocalePath(locale, "/config");
  }, [locale, mac, preferMac, prefillCode]);

  const refreshCatalog = useCallback(async () => {
    const params = new URLSearchParams();
    if (mac) params.append("mac", mac);
    try {
      const res = await fetch(`/api/modes/catalog?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) {
        console.error("[CONFIG] Catalog request failed:", res.status, res.statusText);
        return;
      }
      const data = await res.json().catch((err) => {
        console.error("[CONFIG] Failed to parse catalog JSON:", err);
        return {};
      });
      if (data.items && Array.isArray(data.items)) {
        setCatalogItems(data.items);
      } else {
        console.error("[CONFIG] Invalid catalog response:", data);
      }
    } catch (err) {
      console.error("[CONFIG] Failed to load catalog:", err);
    }
  }, [mac]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    if (mac && currentUser) {
      loadDeviceMembers(mac);
      loadPendingRequests();
    }
  }, [currentUser, loadDeviceMembers, loadPendingRequests, mac]);

  useEffect(() => {
    setMacAccessDenied(false);
  }, [mac]);

  useEffect(() => {
    if (!mac) return;
    fetch(`/api/device/${encodeURIComponent(mac)}/state`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          setMacAccessDenied(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(async (d) => {
        if (!d?.last_persona) return;
        setCurrentMode(d.last_persona);
        setPreviewMode(d.last_persona);
      })
      .catch(() => {});
  }, [mac]);

  useEffect(() => {
    if (!mac) return;
    setLoading(true);
    fetch(`/api/config/${encodeURIComponent(mac)}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          setMacAccessDenied(true);
          throw new Error("Forbidden");
        }
        if (!r.ok) throw new Error("No config");
        return r.json();
      })
      .then((cfg: DeviceConfig) => {
        setConfig(cfg);
        if (cfg.modes?.length) setSelectedModes(new Set(cfg.modes.map((m) => m.toUpperCase())));
        if (Array.isArray(cfg.surfaces) && cfg.surfaces.length) {
          const drafts: Record<string, Record<string, unknown>> = {};
          for (const s of cfg.surfaces) {
            if (!s || typeof s !== "object") continue;
            const rec = s as Record<string, unknown>;
            const id = String(rec.id || "").trim();
            if (!id) continue;
            drafts[id] = { ...rec, id, type: "surface" };
          }
          setSurfaceDrafts(drafts);
        }
        const rawPl = cfg.surfacePlaylist;
        if (Array.isArray(rawPl) && rawPl.length > 0) {
          setSurfacePlaylist(normalizePlaylist(rawPl as unknown[]));
        } else if (Array.isArray(cfg.surfaces) && cfg.surfaces.length) {
          const ids = cfg.surfaces
            .map((s) => (s && typeof s === "object" ? String((s as Record<string, unknown>).id || "").trim() : ""))
            .filter(Boolean);
          setSurfacePlaylist(
            ids.map((surface_id, order) => ({
              surface_id,
              enabled: true,
              duration_sec: 300,
              order,
            })),
          );
        }
        const spm = (cfg.surfacePlaybackMode || cfg.surface_playback_mode || "") as string;
        if (spm === "single" || spm === "rotate" || spm === "scheduled") {
          setSurfacePlaybackMode(spm);
        } else if (Array.isArray(cfg.surfaceSchedule) && cfg.surfaceSchedule.length > 0) {
          setSurfacePlaybackMode("scheduled");
        } else {
          setSurfacePlaybackMode("single");
        }
        if (Array.isArray(cfg.surfaceSchedule) && cfg.surfaceSchedule.length) {
          setSurfaceSchedule(cfg.surfaceSchedule as SurfaceScheduleBlock[]);
        } else {
          setSurfaceSchedule([]);
        }
        if (cfg.refreshStrategy || cfg.refresh_strategy) setStrategy((cfg.refreshStrategy || cfg.refresh_strategy) as string);
        if (cfg.refreshInterval || cfg.refresh_minutes) setRefreshMin((cfg.refreshInterval || cfg.refresh_minutes) as number);
        const loadedDeviceMode = ((cfg.deviceMode || cfg.device_mode || "mode") as string).toLowerCase();
        setDeviceRenderMode(loadedDeviceMode === "surface" ? "surface" : "mode");
        setAssignedLegacyMode(String(cfg.assignedMode || cfg.assigned_mode || ""));
        setAssignedSurface(String(cfg.assignedSurface || cfg.assigned_surface || ""));
        setSurfacePreviewTarget(String(cfg.assignedSurface || cfg.assigned_surface || ""));
        applyGlobalLocation(extractLocationValue(cfg as Record<string, unknown>));
        setModeLanguage((cfg as Record<string, unknown>).modeLanguage as string || (cfg as Record<string, unknown>).mode_language as string || "zh");
        if (cfg.contentTone || cfg.content_tone) setContentTone(normalizeTone(cfg.contentTone || cfg.content_tone));
        if (cfg.characterTones || cfg.character_tones) setCharacterTones((cfg.characterTones || cfg.character_tones) as string[]);
        if (cfg.mode_overrides) setModeOverrides(cfg.mode_overrides);
        else if (cfg.modeOverrides) setModeOverrides(cfg.modeOverrides);
        setIsFocusListening(Boolean(cfg.is_focus_listening ?? Number(cfg.focus_listening || 0) === 1));
        setAlwaysActive(Boolean(cfg.is_always_active ?? Number(cfg.always_active || 0) === 1));
        const loadedOverrides = ((cfg.mode_overrides || cfg.modeOverrides || {}) as Record<string, ModeOverride>);
        const memoFromOverride = loadedOverrides?.MEMO?.memo_text;
        if (typeof memoFromOverride === "string" && memoFromOverride.trim()) {
          setMemoText(memoFromOverride);
        } else if (cfg.memoText || cfg.memo_text) {
          setMemoText((cfg.memoText || cfg.memo_text) as string);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [applyGlobalLocation, mac]);

  const getModeOverride = useCallback((modeId: string) => {
    return modeOverrides[modeId] || {};
  }, [modeOverrides]);

  const sanitizeModeOverride = useCallback((input: ModeOverride) => {
    const cleaned: ModeOverride = {};
    for (const [k, raw] of Object.entries(input)) {
      if (
        k === "city" ||
        k === "timezone" ||
        k === "admin1" ||
        k === "country" ||
        k === "llm_provider" ||
        k === "llm_model"
      ) {
        if (typeof raw === "string" && raw.trim()) cleaned[k] = raw.trim();
        continue;
      }
      if (k === "latitude" || k === "longitude") {
        if (typeof raw === "number" && Number.isFinite(raw)) cleaned[k] = raw;
        continue;
      }
      if (typeof raw === "string") {
        if (raw.trim()) cleaned[k] = raw.trim();
        continue;
      }
      if (typeof raw === "number") {
        if (!Number.isNaN(raw)) cleaned[k] = raw;
        continue;
      }
      if (typeof raw === "boolean") {
        cleaned[k] = raw;
        continue;
      }
      if (Array.isArray(raw)) {
        if (raw.length > 0) cleaned[k] = raw;
        continue;
      }
      if (raw && typeof raw === "object") {
        if (Object.keys(raw).length > 0) cleaned[k] = raw as Record<string, unknown>;
      }
    }
    return cleaned;
  }, []);

  const updateModeOverride = useCallback((modeId: string, patch: Partial<ModeOverride>) => {
    setModeOverrides((prev) => {
      const next = { ...(prev[modeId] || {}), ...patch } as ModeOverride;
      const cleaned = sanitizeModeOverride(next);
      if (!Object.keys(cleaned).length) {
        const copied = { ...prev };
        delete copied[modeId];
        return copied;
      }
      return { ...prev, [modeId]: cleaned };
    });
  }, [sanitizeModeOverride]);

  const requiresParamModal = useCallback((modeId: string) => {
    const m = (modeId || "").toUpperCase();
    return m === "WEATHER" || m === "MEMO" || m === "MY_QUOTE" || m === "COUNTDOWN" || m === "HABIT" || m === "LIFEBAR" || m === "CALENDAR" || m === "TIMETABLE" || m === "BF6_PROFILE";
  }, []);

  const openParamModal = useCallback((modeId: string, action: "preview" | "apply") => {
    const m = (modeId || "").toUpperCase();
    if (m === "WEATHER") {
      setWeatherDraftLocation({});
      setParamModal({ type: "weather", mode: m, action });
      return;
    }
    if (m === "MEMO") {
      const existing = (modeOverrides[m]?.memo_text as string) || memoText || "";
      setMemoDraft(existing);
      setParamModal({ type: "memo", mode: m, action });
      return;
    }
    if (m === "MY_QUOTE") {
      setQuoteDraft("");
      setAuthorDraft("");
      setParamModal({ type: "quote", mode: m, action });
      return;
    }
    if (m === "COUNTDOWN") {
      setParamModal({ type: "countdown", mode: m, action });
      return;
    }
    if (m === "HABIT") {
      const savedOv = modeOverrides["HABIT"] || {};
      const savedItems = Array.isArray(savedOv.habitItems) ? (savedOv.habitItems as Array<{ name: string; done?: boolean }>) : null;
      if (savedItems && savedItems.length > 0) {
        setHabitItems(savedItems.map((h) => ({ name: h.name, done: h.done ?? false })));
      }
      setParamModal({ type: "habit", mode: m, action });
      return;
    }
    if (m === "LIFEBAR") {
      setParamModal({ type: "lifebar", mode: m, action });
      return;
    }
    if (m === "CALENDAR") {
      setParamModal({ type: "calendar", mode: m, action });
      return;
    }
    if (m === "TIMETABLE") {
      const existing = (modeOverrides[m] || {}) as Record<string, unknown>;
      if (existing.periods && existing.courses) {
        setTimetableData({
          style: (existing.style as "daily" | "weekly") || "daily",
          periods: existing.periods as string[],
          courses: existing.courses as Record<string, string>,
        });
      }
      setParamModal({ type: "timetable", mode: m, action });
      return;
    }
    if (m === "BF6_PROFILE") {
      const existing = (modeOverrides[m] || {}) as Record<string, unknown>;
      setBf6UsernameDraft(typeof existing.bf6_username === "string" ? existing.bf6_username : "");
      setBf6PlatformDraft(
        typeof existing.bf6_platform === "string" && existing.bf6_platform.trim()
          ? existing.bf6_platform
          : "pc",
      );
      setParamModal({ type: "bf6", mode: m, action });
      return;
    }
  }, [memoText, modeOverrides]);

  const clearModeOverride = useCallback((modeId: string) => {
    setModeOverrides((prev) => {
      const copied = { ...prev };
      delete copied[modeId];
      return copied;
    });
    setSettingsJsonDrafts((prev) => {
      const copied = { ...prev };
      Object.keys(copied).forEach((k) => {
        if (k.startsWith(`${modeId}:`)) delete copied[k];
      });
      return copied;
    });
    setSettingsJsonErrors((prev) => {
      const copied = { ...prev };
      Object.keys(copied).forEach((k) => {
        if (k.startsWith(`${modeId}:`)) delete copied[k];
      });
      return copied;
    });
    if (modeId === "COUNTDOWN") {
      setConfig((prev) => ({
        ...prev,
        countdownEvents: [],
        countdown_events: [],
      }));
    }
  }, []);

  const modeSchemaMap = useMemo(
    () => Object.fromEntries(catalogItems.map((m) => [m.mode_id.toUpperCase(), m.settings_schema || []])),
    [catalogItems]
  );

  const applySettingsDrafts = useCallback((modeId: string) => {
    const schema = modeSchemaMap[modeId] || [];
    for (const item of schema) {
      if (!item.as_json) continue;
      const key = `${modeId}:${item.key}`;
      if (!(key in settingsJsonDrafts)) continue;
      const text = settingsJsonDrafts[key] || "";
      if (!text.trim()) {
        updateModeOverride(modeId, { [item.key]: undefined });
        continue;
      }
      try {
        const parsed = JSON.parse(text);
        updateModeOverride(modeId, { [item.key]: parsed });
      } catch {
        setSettingsJsonErrors((prev) => ({ ...prev, [key]: tr("JSON 格式错误", "Invalid JSON") }));
        showToast(`${item.label} ${tr("JSON 格式错误", "Invalid JSON")}`, "error");
        return false;
      }
    }
    return true;
  }, [modeSchemaMap, settingsJsonDrafts, showToast, tr, updateModeOverride]);

  const handleSave = async () => {
    if (!mac) { showToast(tr("请先完成刷机和配网以获取设备 MAC", "Please flash and provision to get device MAC"), "error"); return; }
    if (macAccessDenied) { showToast(tr("你无权配置该设备", "No permission to configure this device"), "error"); return; }
    setSaving(true);
    try {
      const normalizedModeOverrides = Object.fromEntries(
        Object.entries(modeOverrides)
          .map(([modeId, ov]) => {
            const cleaned = sanitizeModeOverride(ov);
            return [modeId.toUpperCase(), cleaned] as const;
          })
          .filter(([, ov]) => Object.keys(ov).length > 0)
      );
      const normalizedSurfaces = surfacesPayloadFromCatalog(surfaceCatalog);
      const resolvedAssignedSurface = assignedSurface || normalizedSurfaces[0]?.id || "";
      const plErr = validatePlaylist(surfacePlaylist);
      if (plErr) {
        showToast(
          plErr === "playlist_needs_enabled"
            ? tr("播放列表至少启用一项", "Enable at least one playlist item", "Uključi barem jednu stavku playliste")
            : tr("每项时长至少 10 秒", "Each duration must be ≥ 10 seconds", "Trajanje ≥ 10 s"),
          "error",
        );
        return;
      }
      if (surfacePlaybackMode === "scheduled") {
        if (!surfaceSchedule.length) {
          showToast(tr("日程模式至少需要一个时段", "Scheduled mode needs at least one block", "Rasporedu treba barem jedan blok"), "error");
          return;
        }
        const ov = validateScheduleNonOverlapping(surfaceSchedule);
        if (ov) {
          showToast(tr("日程时段不能重叠", "Schedule blocks must not overlap", "Blokovi se ne smiju preklapati"), "error");
          return;
        }
      }
      for (const s of surfaceCatalog) {
        if (surfaceHasEmptyGridSlot(s.definition)) {
          showToast(
            tr(`Surface「${s.id}」有未分配槽位`, `Surface “${s.id}” has empty slots`, `Surface „${s.id}” ima prazne slotove`),
            "error",
          );
          return;
        }
      }
      const body: Record<string, unknown> = {
        mac,
        modes: Array.from(selectedModes),
        refreshStrategy: strategy,
        refreshInterval: refreshMin,
        ...currentLocation,
        modeLanguage,
        contentTone,
        characterTones: characterTones,
        modeOverrides: normalizedModeOverrides,
        memoText: memoText,
        deviceMode: deviceRenderMode,
        assignedMode: assignedLegacyMode || (Array.from(selectedModes)[0] || "STOIC"),
        assignedSurface: resolvedAssignedSurface,
        surfaces: normalizedSurfaces,
        surfacePlaylist: surfacePlaylist.map((p, order) => ({ ...p, order })),
        surfacePlaybackMode,
        surfaceSchedule,
        is_focus_listening: isFocusListening,
        always_active: alwaysActive,
      };
      const res = await fetch("/api/config", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      let onlineNow = isOnline;
      let refreshQueued = false;
      let latestLastSeen: string | null = lastSeen;
      const syncResult = await queueImmediateRefreshIfOnline(fetch, mac, authHeaders());
      onlineNow = syncResult.onlineNow ?? isOnline;
      refreshQueued = syncResult.refreshQueued;
      latestLastSeen = syncResult.lastSeen;
      if (syncResult.onlineNow !== null) {
        setIsOnline(syncResult.onlineNow);
      }
      setLastSeen(latestLastSeen);
      showToast(
        syncResult.onlineNow === null
          ? tr("配置已保存，暂时无法确认设备状态", "Settings saved, but device status is currently unavailable")
          : onlineNow
            ? (refreshQueued
                ? tr("配置已保存，已通知设备立即刷新", "Settings saved, device notified to refresh now")
                : tr("配置已保存，设备在线，但立即刷新通知失败", "Settings saved, device is online, but immediate refresh notification failed"))
            : tr("配置已保存，设备当前离线，将在设备上线后生效", "Settings saved. Device is offline and will update when it comes online"),
        syncResult.onlineNow === null || !refreshQueued ? "info" : "success",
      );
      setPreviewNoCacheOnce(true);
    } catch {
      showToast(tr("保存失败", "Save failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const [savingPrefs, setSavingPrefs] = useState(false);
  const handleSavePreferences = async () => {
    if (!mac) { showToast(tr("请先完成刷机和配网以获取设备 MAC", "Please flash and provision to get device MAC"), "error"); return; }
    if (macAccessDenied) { showToast(tr("你无权配置该设备", "No permission"), "error"); return; }
    setSavingPrefs(true);
    try {
      const normalizedModeOverrides = Object.fromEntries(
        Object.entries(modeOverrides)
          .map(([modeId, ov]) => {
            const cleaned = sanitizeModeOverride(ov);
            return [modeId.toUpperCase(), cleaned] as const;
          })
          .filter(([, ov]) => Object.keys(ov).length > 0)
      );
      const normalizedSurfaces = surfacesPayloadFromCatalog(surfaceCatalog);
      const resolvedAssignedSurface = assignedSurface || normalizedSurfaces[0]?.id || "";
      const plErr = validatePlaylist(surfacePlaylist);
      if (plErr) {
        showToast(
          plErr === "playlist_needs_enabled"
            ? tr("播放列表至少启用一项", "Enable at least one playlist item", "Uključi barem jednu stavku playliste")
            : tr("每项时长至少 10 秒", "Each duration must be ≥ 10 seconds", "Trajanje ≥ 10 s"),
          "error",
        );
        return;
      }
      if (surfacePlaybackMode === "scheduled") {
        if (!surfaceSchedule.length) {
          showToast(tr("日程模式至少需要一个时段", "Scheduled mode needs at least one block", "Rasporedu treba barem jedan blok"), "error");
          return;
        }
        const ov = validateScheduleNonOverlapping(surfaceSchedule);
        if (ov) {
          showToast(tr("日程时段不能重叠", "Schedule blocks must not overlap", "Blokovi se ne smiju preklapati"), "error");
          return;
        }
      }
      for (const s of surfaceCatalog) {
        if (surfaceHasEmptyGridSlot(s.definition)) {
          showToast(
            tr(`Surface「${s.id}」有未分配槽位`, `Surface “${s.id}” has empty slots`, `Surface „${s.id}” ima prazne slotove`),
            "error",
          );
          return;
        }
      }
      const body: Record<string, unknown> = {
        mac,
        modes: Array.from(selectedModes),
        refreshStrategy: strategy,
        refreshInterval: refreshMin,
        ...currentLocation,
        modeLanguage,
        contentTone,
        characterTones: characterTones,
        modeOverrides: normalizedModeOverrides,
        memoText: memoText,
        deviceMode: deviceRenderMode,
        assignedMode: assignedLegacyMode || (Array.from(selectedModes)[0] || "STOIC"),
        assignedSurface: resolvedAssignedSurface,
        surfaces: normalizedSurfaces,
        surfacePlaylist: surfacePlaylist.map((p, order) => ({ ...p, order })),
        surfacePlaybackMode,
        surfaceSchedule,
        is_focus_listening: isFocusListening,
        always_active: alwaysActive,
      };
      const res = await fetch("/api/config", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast(tr("配置已保存", "Settings saved"), "success");
      setPreviewNoCacheOnce(true);
    } catch {
      showToast(tr("保存失败", "Save failed"), "error");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleFocusListening = useCallback(async () => {
    if (!mac) return;
    const next = !isFocusListening;
    setFocusToggleLoading(true);
    try {
      const res = await fetch(
        `/api/config/${encodeURIComponent(mac)}/focus-listening?enabled=${next}`,
        { method: "PATCH", headers: authHeaders() },
      );
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error("[FOCUS] Toggle failed:", res.status, errorText);
        throw new Error("focus-toggle-failed");
      }
      const data = (await res.json().catch(() => ({}))) as { alert_token?: string | null };
      setIsFocusListening(next);
      if (next && data?.alert_token) {
        setFocusAlertToken(data.alert_token);
        setShowFocusTokenModal(true);
      }
      showToast(
        next
          ? tr("Focus 专注模式就绪，OpenCLAW 守护中", "Focus mode is ready, guarded by OpenCLAW")
          : tr("专注监听已关闭，设备将按原计划轮播内容", "Focus listening disabled. The device will resume normal rotation"),
        "success",
      );
    } catch (err) {
      console.error("[FOCUS] Toggle error:", err);
      showToast(tr("切换专注监听失败，请稍后重试", "Failed to toggle Focus Listening. Please try again"), "error");
    } finally {
      setFocusToggleLoading(false);
    }
  }, [isFocusListening, mac, showToast, tr]);

  const buildPreviewParams = useCallback((mode?: string, forceNoCache = false, forcedModeOverride?: ModeOverride, clearSavedOverride = false) => {
    const m = mode || previewMode;
    const consumeNoCacheOnce = previewNoCacheOnce;
    const forceFresh = forceNoCache || consumeNoCacheOnce;
    const params = new URLSearchParams({ persona: m });
    if (mac) params.set("mac", mac);
    if (clearSavedOverride && m === "COUNTDOWN") {
      params.set("mode_override", JSON.stringify({ countdownEvents: [] }));
      if (previewColors > 2) params.set("colors", String(previewColors));
      if (forceFresh) params.set("no_cache", "1");
      const bodyCd = inksightBodySize(DEFAULT_PANEL_W, DEFAULT_PANEL_H);
      params.set("w", String(bodyCd.w));
      params.set("h", String(bodyCd.h));
      return { m, params, consumeNoCacheOnce };
    }
    const modeOverrideSource = sanitizeModeOverride(
      clearSavedOverride
        ? {
            ...(m === "COUNTDOWN" ? { countdownEvents: [] } : {}),
            ...(forcedModeOverride || {}),
          }
        : {
            ...(modeOverrides[m] || {}),
            ...(forcedModeOverride || {}),
          }
    );
    const savedOverrides = (config.mode_overrides || config.modeOverrides || {}) as Record<string, ModeOverride>;
    const effectiveLocation = cleanLocationValue(
      modeOverrideSource.city
        ? extractLocationValue(modeOverrideSource as Record<string, unknown>)
        : currentLocation,
    );
    const savedEffectiveLocation = cleanLocationValue(
      savedOverrides[m]?.city
        ? extractLocationValue(savedOverrides[m] as Record<string, unknown>)
        : extractLocationValue(config as Record<string, unknown>),
    );
    const locationChanged = Boolean(effectiveLocation.city) && !locationsEqual(effectiveLocation, savedEffectiveLocation);

    const activeModeOverride = sanitizeModeOverride({
      ...modeOverrideSource,
      ...(locationChanged ? effectiveLocation : {}),
    });
    if (!clearSavedOverride && m === "MEMO" && memoText.trim() && !("memo_text" in activeModeOverride)) {
      activeModeOverride.memo_text = memoText.trim();
    }
    const hasModeOverride = Object.keys(activeModeOverride).length > 0;
    if (hasModeOverride) {
      params.set("mode_override", JSON.stringify(activeModeOverride));
    }
    if (m === "MEMO") {
      const memoCandidate = (
        typeof forcedModeOverride?.memo_text === "string" && forcedModeOverride.memo_text.trim()
          ? forcedModeOverride.memo_text
          : typeof activeModeOverride.memo_text === "string" && activeModeOverride.memo_text.trim()
          ? activeModeOverride.memo_text
          : memoText
      ).trim();
      if (memoCandidate) {
        params.set("memo_text", memoCandidate);
      }
    }
    if (locationChanged && effectiveLocation.city) params.set("city_override", effectiveLocation.city);
    if (previewColors > 2) params.set("colors", String(previewColors));
    if (forceFresh || locationChanged || hasModeOverride) params.set("no_cache", "1");
    const body = inksightBodySize(DEFAULT_PANEL_W, DEFAULT_PANEL_H);
    params.set("w", String(body.w));
    params.set("h", String(body.h));
    return { m, params, consumeNoCacheOnce };
  }, [config, currentLocation, mac, memoText, modeOverrides, previewColors, previewMode, previewNoCacheOnce, sanitizeModeOverride]);

  const ownerUsername = useMemo(
    () => deviceMembers.find((member) => member.role === "owner")?.username || "",
    [deviceMembers],
  );

  const formatPreviewUsageText = useCallback((usageSource?: string) => {
    switch (usageSource) {
      case "current_user_api_key":
        return tr("当前使用你的 API key", "Using your API key");
      case "owner_api_key":
        return ownerUsername
          ? tr(`当前使用 owner（${ownerUsername}）的 API key`, `Using ${ownerUsername}'s API key`)
          : tr("当前使用 owner 的 API key", "Using owner's API key");
      case "owner_free_quota":
        return ownerUsername
          ? tr(`当前消耗 owner（${ownerUsername}）的免费额度`, `Using ${ownerUsername}'s free quota`)
          : tr("当前消耗 owner 的免费额度", "Using owner's free quota");
      case "current_user_free_quota":
        return tr("当前消耗你的免费额度", "Using your free quota");
      default:
        return "";
    }
  }, [ownerUsername, tr]);

  const handlePreview = useCallback(async (mode?: string, forceNoCache = false, forcedModeOverride?: ModeOverride, confirmed = false, clearSavedOverride = false) => {
    const { m, params, consumeNoCacheOnce } = buildPreviewParams(mode, forceNoCache, forcedModeOverride, clearSavedOverride);
    if (!m) return;

    if (mac && !confirmed) {
      try {
        const intentParams = new URLSearchParams(params);
        intentParams.set("intent", "1");
        const intentRes = await fetch(`/api/preview?${intentParams.toString()}`, {
          cache: "no-store",
          headers: authHeaders(),
        });
        if (intentRes.ok) {
          const intentData = (await intentRes.json()) as {
            cache_hit?: boolean;
            usage_source?: string;
            requires_invite_code?: boolean;
            llm_mode_requires_quota?: boolean;
          };
          if (intentData.requires_invite_code) {
            setPreviewConfirm(null);
            setShowInviteModal(true);
            setPendingPreviewMode(m);
            setPreviewStatusText(formatPreviewUsageText(intentData.usage_source));
            return;
          }
          if (!intentData.cache_hit && intentData.llm_mode_requires_quota) {
            setPreviewConfirm({
              mode: m,
              forceNoCache,
              forcedModeOverride,
              usageSource: intentData.usage_source,
            });
            return;
          }
        }
      } catch {}
    }

    setPreviewConfirm(null);
    setPreviewCacheHit(null);
    setPreviewLlmStatus(null);
    setPreviewLoading(true);
    setPreviewStatusText(tr("正在生成...", "Generating..."));
    try {
      previewStreamRef.current?.close();
      const stream = new EventSource(`/api/preview/stream?${params.toString()}`);
      previewStreamRef.current = stream;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        stream.addEventListener("status", (event) => {
          try {
            const data = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
            setPreviewStatusText(data.message || tr("正在生成...", "Generating..."));
          } catch {
            setPreviewStatusText(tr("正在生成...", "Generating..."));
          }
        });

        stream.addEventListener("error", (event) => {
          if (settled) return;
          try {
            const data = JSON.parse((event as MessageEvent<string>).data) as {
              error?: string;
              message?: string;
              requires_invite_code?: boolean;
              usage_source?: string;
            };
            if (data.requires_invite_code) {
              settled = true;
              stream.close();
              previewStreamRef.current = null;
              setPreviewConfirm(null);
              setShowInviteModal(true);
              setPendingPreviewMode(m);
              setPreviewStatusText(formatPreviewUsageText(data.usage_source));
              setPreviewLoading(false);
              resolve();
              return;
            }
            settled = true;
            stream.close();
            previewStreamRef.current = null;
            setPreviewLoading(false);
            reject(new Error(data.message || "Preview failed"));
          } catch {
            settled = true;
            stream.close();
            previewStreamRef.current = null;
            setPreviewLoading(false);
            reject(new Error("Preview failed"));
          }
        });

        stream.addEventListener("result", async (event) => {
          try {
            const data = JSON.parse((event as MessageEvent<string>).data) as {
              message?: string;
              image_url?: string;
              cache_hit?: boolean;
              preview_status?: string;
              llm_required?: boolean;
              usage_source?: string;
            };
            console.log("[PREVIEW] Result event received:", { hasImageUrl: !!data.image_url, message: data.message });
            if (!data.image_url) {
              settled = true;
              console.error("[PREVIEW] Missing image_url in result event");
              setPreviewLoading(false);
              reject(new Error("Preview image missing"));
              return;
            }
            settled = true;
            const imageResponse = await fetch(data.image_url, { cache: "no-store" });
            if (!imageResponse.ok) {
              setPreviewLoading(false);
              reject(new Error("Preview image unavailable"));
              return;
            }
            const imageBlob = await imageResponse.blob();
            const objectUrl = URL.createObjectURL(imageBlob);
            console.log("[PREVIEW] Setting preview image:", data.image_url.substring(0, 50) + "...");
            replacePreviewImg(objectUrl);
            setPreviewCacheHit(typeof data.cache_hit === "boolean" ? data.cache_hit : null);
            setPreviewStatusText(data.message || tr("完成", "Done"));
            const status = (data.preview_status || "").toLowerCase();
            const llmRequired = data.llm_required;
            if (status === "no_llm_required" || llmRequired === false) {
              setPreviewLlmStatus(null);
            } else if (status === "model_generated") {
              setPreviewLlmStatus(tr("大模型调用成功", "Model call succeeded", "Model je uspješno pozvan"));
            } else if (status === "fallback_used") {
              setPreviewLlmStatus(tr("大模型调用失败，使用默认内容", "Model call failed, using fallback content", "Poziv modela nije uspio, koristi se zadani sadržaj"));
            } else {
              setPreviewLlmStatus(null);
            }
            setPreviewLoading(false); // Reset loading state
            stream.close();
            previewStreamRef.current = null;
            resolve();
          } catch (error) {
            console.error("[PREVIEW] Error processing result event:", error);
            setPreviewLoading(false);
            reject(error);
          }
        });

        stream.onerror = () => {
          if (settled) return;
          settled = true;
          stream.close();
          previewStreamRef.current = null;
          setPreviewLoading(false);
          reject(new Error("Preview failed"));
        };
      });
    } catch {
      showToast(tr("预览失败", "Preview failed"), "error");
      setPreviewCacheHit(null);
      setPreviewStatusText("");
    } finally {
      setPreviewLoading(false);
      if (consumeNoCacheOnce) setPreviewNoCacheOnce(false);
    }
  }, [buildPreviewParams, formatPreviewUsageText, mac, replacePreviewImg, showToast, tr]);

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
      // Retry preview
      if (pendingPreviewMode) {
        await handlePreview(pendingPreviewMode, true);
        setPendingPreviewMode(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("邀请码兑换失败", "Failed to redeem invitation code", "Iskorištavanje koda pozivnice nije uspjelo");
      showToast(msg, "error");
    } finally {
      setRedeemingInvite(false);
    }
  };

  const loadStats = useCallback(async () => {
    if (!mac) return;
    try {
      const res = await fetch(`/api/stats/${encodeURIComponent(mac)}`, { headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [mac]);

  const loadFavorites = useCallback(async (force = false) => {
    if (!mac) return;
    if (!force && favoritesLoadedMacRef.current === mac) return;
    try {
      const res = await fetch(`/api/device/${encodeURIComponent(mac)}/favorites?limit=100`, { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        setMacAccessDenied(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const modes = new Set<string>(
        (data.favorites || [])
          .map((item: { mode_id?: string }) => (item.mode_id || "").toUpperCase())
          .filter((modeId: string) => modeId.length > 0),
      );
      setFavoritedModes(modes);
      favoritesLoadedMacRef.current = mac;
    } catch {}
  }, [mac]);

  const loadRuntimeMode = useCallback(async () => {
    if (!mac) return;
    try {
      const res = await fetch(`/api/device/${encodeURIComponent(mac)}/state`, { cache: "no-store", headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        setMacAccessDenied(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setIsOnline(Boolean(data?.is_online));
      setLastSeen(typeof data?.last_seen === "string" && data.last_seen ? data.last_seen : null);
      const mode = data?.runtime_mode;
      if (mode === "active" || mode === "interval") {
        setRuntimeMode(mode);
      } else {
        setRuntimeMode("interval");
      }
    } catch {
      setIsOnline(false);
      setLastSeen(null);
      setRuntimeMode("interval");
    }
  }, [mac]);

  useEffect(() => {
    if (activeTab === "stats" && mac) loadStats();
  }, [activeTab, mac, loadStats]);

  useEffect(() => {
    if (!mac) return;
    favoritesLoadedMacRef.current = "";
    loadFavorites();
  }, [mac, loadFavorites]);

  useEffect(() => {
    if (!mac) return;
    loadRuntimeMode();
  }, [mac, loadRuntimeMode]);

  useEffect(() => {
    if (!mac || !currentUser) {
      setSettingsMode(null);
    }
  }, [mac, currentUser]);

  useEffect(() => {
    return () => {
      previewStreamRef.current?.close();
      previewStreamRef.current = null;
    };
  }, []);

  const handleGenerateMode = async () => {
    if (!customDesc.trim()) { showToast(tr("请输入模式描述", "Please enter a mode description"), "error"); return; }
    setCustomGenerating(true);
    try {
      const res = await fetch("/api/modes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          description: customDesc, 
          provider: "deepseek", 
          model: "deepseek-chat",
          mac: mac || undefined,
        }),
      });

      // Quota exhausted: backend returns 402 per BILLING.md
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        showToast(
          (d && d.error) || tr(
            "您的免费额度已用完，请输入邀请码或在个人信息中配置自己的 API key。",
            "Your free quota has been exhausted, please redeem an invitation code or configure your own API key in your profile.",
            "Besplatna kvota je potrošena. Iskoristi kod pozivnice ili postavi vlastiti API ključ u profilu.",
          ),
          "error",
        );
        setShowInviteModal(true);
        setCustomGenerating(false);
        return;
      }

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || tr("生成失败", "Generation failed"));
      setCustomJson(JSON.stringify(data.mode_def, null, 2));
      setCustomModeName((data.mode_def?.display_name || "").toString());
      setCustomEditorSource("ai");
      showToast(tr("模式生成成功", "Mode generated successfully"), "success");

      // Close modal right after generation, then start preview on the right panel
      const finalName = (customModeName || data.mode_def?.display_name || "").toString().trim();
      setPreviewModeLabelOverride(finalName || null);
      setEditingCustomMode(false);
      requestAnimationFrame(() => {
        previewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      // show "previewing" on the right panel while preview is being built
      setPreviewLoading(true);
      setPreviewStatusText(tr("模式预览中...", "Generating preview...", "Generiram pregled..."));

      await handleCustomPreview(data.mode_def);
    } catch (e) {
      showToast(`${tr("生成失败", "Generation failed")}: ${e instanceof Error ? e.message : tr("未知错误", "Unknown error")}`, "error");
    } finally {
      setCustomGenerating(false);
    }
  };

  const handleCustomPreview = async (defOverride?: unknown) => {
    if (!defOverride && !customJson.trim()) return;
    setCustomPreviewLoading(true);
    setPreviewLoading(true);
    if (!previewStatusText) setPreviewStatusText(tr("模式预览中...", "Generating preview...", "Generiram pregled..."));
    try {
      const def = defOverride ? (defOverride as Record<string, unknown>) : (JSON.parse(customJson) as Record<string, unknown>);
      if (customModeName.trim()) {
        (def as Record<string, unknown>).display_name = customModeName.trim();
      }
      let modeHint = "CUSTOM_PREVIEW";
      try {
        if (customModeName.trim()) {
          modeHint = customModeName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        } else {
          const modeIdRaw = (def as Record<string, unknown>)["mode_id"];
          if (typeof modeIdRaw === "string" && modeIdRaw.trim()) {
            modeHint = modeIdRaw.trim().toUpperCase();
          }
        }
      } catch {}
      const res = await fetch("/api/modes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode_def: def, mac: mac || undefined, colors: previewColors }),
      });

      // Quota exhausted: returns 402
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        showToast(
          (d && d.error) || tr(
            "您的免费额度已用完，请输入邀请码或在个人信息中配置自己的 API key。",
            "Your free quota has been exhausted, please redeem an invitation code or configure your own API key in your profile.",
            "Besplatna kvota je potrošena. Iskoristi kod pozivnice ili postavi vlastiti API ključ u profilu.",
          ),
          "error",
        );
        setShowInviteModal(true);
        setCustomPreviewLoading(false);
        return;
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || tr("预览失败", "Preview failed"));
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (customPreviewImg) {
        try { URL.revokeObjectURL(customPreviewImg); } catch {}
      }
      setCustomPreviewImg(objectUrl);

      // show custom-mode preview in the right E-Ink panel
      setPreviewMode(modeHint);
      setPreviewCacheHit(null);
      const status = (res.headers.get("x-preview-status") || "").toLowerCase();
      const llmRequiredHeader = (res.headers.get("x-llm-required") || "").toLowerCase();
      if (status === "no_llm_required" || llmRequiredHeader === "0" || llmRequiredHeader === "false") {
        setPreviewLlmStatus(null);
      } else if (status === "model_generated") {
        setPreviewLlmStatus(tr("大模型调用成功", "Model call succeeded", "Model je uspješno pozvan"));
      } else if (status === "fallback_used") {
        setPreviewLlmStatus(tr("大模型调用失败，使用默认内容", "Model call failed, using fallback content", "Poziv modela nije uspio, koristi se zadani sadržaj"));
      } else {
        setPreviewLlmStatus(null);
      }
      replacePreviewImg(objectUrl);
    } catch (e) {
      showToast(`${tr("预览失败", "Preview failed")}: ${e instanceof Error ? e.message : ""}`, "error");
    } finally {
      setCustomPreviewLoading(false);
      setPreviewLoading(false);
    }
  };

  const handleSaveCustomMode = async () => {
    if (!customJson.trim()) return;
    if (!mac) {
      showToast(tr("请先选择设备", "Please select a device first"), "error");
      return;
    }
    try {
      const def = JSON.parse(customJson);
      
      // Ensure mode_id exists - generate from display_name if missing
      if (!def.mode_id || !def.mode_id.trim()) {
        if (customModeName.trim()) {
          def.mode_id = customModeName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
          // Ensure it starts with a letter
          if (!/^[A-Z]/.test(def.mode_id)) {
            def.mode_id = "CUSTOM_" + def.mode_id;
          }
        } else if (def.display_name) {
          def.mode_id = def.display_name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
          if (!/^[A-Z]/.test(def.mode_id)) {
            def.mode_id = "CUSTOM_" + def.mode_id;
          }
        } else {
          // Generate a random mode_id if no name is available
          def.mode_id = "CUSTOM_" + Math.random().toString(36).substring(2, 10).toUpperCase();
        }
      }
      
      if (customModeName.trim()) {
        def.display_name = customModeName.trim();
      }
      
      // Add mac to the request body
      def.mac = mac;
      
      const res = await fetch("/api/modes/custom", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(def),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `${tr("保存失败", "Save failed")}: ${res.status}`);
      }
      
      const data = await res.json();
      if (data.ok || data.status === "ok") {
        showToast(`${tr("模式", "Mode")} ${def.mode_id} ${tr("已保存", "saved")}`, "success");
        // Refresh catalog (modes + categories + settings schema)
        refreshCatalog();
        setEditingCustomMode(false);
        setCustomJson("");
        setCustomDesc("");
        setCustomModeName("");
        if (customPreviewImg) {
          try { URL.revokeObjectURL(customPreviewImg); } catch {}
        }
        setCustomPreviewImg(null);
        setCustomEditorSource(null);
      } else {
        throw new Error(data.error || tr("保存失败", "Save failed"));
      }
    } catch (e) {
      showToast(`${tr("保存失败", "Save failed")}: ${e instanceof Error ? e.message : ""}`, "error");
    }
  };

  const toggleMode = useCallback((modeId: string) => {
    setSelectedModes((prev) => {
      const next = new Set(prev);
      if (next.has(modeId)) next.delete(modeId);
      else next.add(modeId);
      return next;
    });
  }, []);

  const handleModePreview = (m: string) => {
    const modeId = (m || "").toUpperCase();
    setPreviewMode(modeId);
    if (modeId === "MY_ADAPTIVE") {
      setPendingAdaptiveAction({ action: "preview", mode: modeId });
      adaptiveFileInputRef.current?.click();
      return;
    }
    if (requiresParamModal(modeId)) {
      openParamModal(modeId, "preview");
      return;
    }
    // Config page preview should bypass cache so it:
    // - reflects latest overrides
    // - triggers quota deduction when applicable (quota is only deducted on cache miss)
    handlePreview(modeId, true);
  };

  const handleModeApply = async (m: string) => {
    const modeId = (m || "").toUpperCase();
    if (modeId === "MY_ADAPTIVE" && !selectedModes.has(modeId)) {
      setPendingAdaptiveAction({ action: "apply", mode: modeId });
      adaptiveFileInputRef.current?.click();
      return;
    }
    if (requiresParamModal(modeId) && !selectedModes.has(modeId)) {
      // only require params when adding to carousel
      openParamModal(modeId, "apply");
      return;
    }
    const wasSelected = selectedModes.has(modeId);
    toggleMode(modeId);
    if (!wasSelected && !assignedLegacyMode) {
      setAssignedLegacyMode(modeId);
    }
    showToast(
      wasSelected
        ? tr("已从轮播移除", "Removed from rotation")
        : tr("已加入轮播", "Added to rotation"),
      "success",
    );
  };

  const surfacePlaylistContains = useCallback(
    (surfaceId: string) => surfacePlaylist.some((p) => p.surface_id === surfaceId),
    [surfacePlaylist],
  );

  const addSurfaceToPlaylist = useCallback(
    (surfaceId: string) => {
      setSurfacePlaylist((prev) => {
        if (prev.some((p) => p.surface_id === surfaceId)) return prev;
        const next = [
          ...prev,
          { surface_id: surfaceId, enabled: true, duration_sec: 300, order: prev.length },
        ];
        return next.map((p, order) => ({ ...p, order }));
      });
      if (!assignedSurface) setAssignedSurface(surfaceId);
      showToast(tr("已加入播放列表", "Added to playlist", "Dodano na playlistu"), "success");
    },
    [assignedSurface, showToast, tr],
  );

  const removeSurfaceFromPlaylist = useCallback(
    (surfaceId: string) => {
      setSurfacePlaylist((prev) => {
        const next = prev.filter((p) => p.surface_id !== surfaceId);
        return next.map((p, order) => ({ ...p, order }));
      });
      if (surfaceLayoutEditorId === surfaceId) {
        setSurfaceLayoutEditorId("");
        replaceSurfacePreviewImg(null);
      }
      showToast(tr("已从播放列表移除", "Removed from playlist", "Uklonjeno s playliste"), "success");
    },
    [replaceSurfacePreviewImg, showToast, surfaceLayoutEditorId, tr],
  );

  const handleCustomModeDelete = async (m: string) => {
    const modeId = (m || "").toUpperCase();
    if (!mac) {
      showToast(tr("请先选择设备", "Please select a device first"), "error");
      return;
    }
    const confirmed = window.confirm(
      tr(`确定删除自定义模式 ${modeId} 吗？`, `Delete custom mode ${modeId}?`),
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `/api/modes/custom/${encodeURIComponent(modeId)}?mac=${encodeURIComponent(mac)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        throw new Error(data.error || tr("删除失败", "Delete failed"));
      }
      setSelectedModes((prev) => {
        const next = new Set(prev);
        next.delete(modeId);
        return next;
      });
      setModeOverrides((prev) => {
        const copied = { ...prev };
        delete copied[modeId];
        return copied;
      });
      if (previewMode === modeId) {
        setPreviewMode("");
      }
      if (settingsMode === modeId) {
        setSettingsMode(null);
      }
      refreshCatalog();
      showToast(tr("自定义模式已删除", "Custom mode deleted"), "success");
    } catch (e) {
      showToast(`${tr("删除失败", "Delete failed")}: ${e instanceof Error ? e.message : ""}`, "error");
    }
  };

  const commitModalAction = useCallback(async (modeId: string, action: "preview" | "apply", forcedOverride?: ModeOverride, clearSavedOverride = false) => {
    setParamModal(null);
    if (clearSavedOverride) {
      clearModeOverride(modeId);
    } else if (forcedOverride && Object.keys(forcedOverride).length > 0) {
      updateModeOverride(modeId, forcedOverride);
      if (modeId === "MEMO" && typeof forcedOverride.memo_text === "string") {
        setMemoText(forcedOverride.memo_text);
      }
      if (modeId === "WEATHER" && typeof forcedOverride.city === "string") {
        // keep global city as-is; weather override is per-mode
      }
    }

    setPreviewMode(modeId);
    await handlePreview(modeId, true, forcedOverride, false, clearSavedOverride);

    if (action === "apply") {
      if (!selectedModes.has(modeId)) {
        toggleMode(modeId);
        showToast(tr("已加入轮播", "Added to rotation"), "success");
      }
    }
  }, [clearModeOverride, handlePreview, selectedModes, showToast, toggleMode, tr, updateModeOverride]);

  const handlePreviewFromSettings = (addToCarousel: boolean) => {
    if (!settingsMode) return;
    const modeId = settingsMode;
    if (!applySettingsDrafts(modeId)) return;
    let forcedOverride: ModeOverride | undefined;
    if (modeId === "MEMO") {
      const latestMemo = memoSettingsInputRef.current?.value ?? "";
      if (latestMemo.trim()) {
        forcedOverride = { memo_text: latestMemo };
        updateModeOverride(modeId, { memo_text: latestMemo });
        setMemoText(latestMemo);
      }
    }
    if (addToCarousel && !selectedModes.has(modeId)) {
      toggleMode(modeId);
    }
    setSettingsMode(null);
    setPreviewMode(modeId);
    setTimeout(() => {
      handlePreview(modeId, true, forcedOverride);
    }, 0);
    showToast(
      addToCarousel
        ? tr("已加入轮播并刷新预览", "Added to rotation and preview refreshed")
        : tr("已刷新预览", "Preview refreshed"),
      "success",
    );
  };

  const handleApplyPreviewToScreen = async () => {
    if (!mac || !previewMode || !previewImg) return;
    setApplyToScreenLoading(true);
    try {
      const stateRes = await fetch(`/api/device/${encodeURIComponent(mac)}/state`, { cache: "no-store", headers: authHeaders() });
      if (!stateRes.ok) {
        showToast(tr("无法确认设备状态，已阻止发送", "Unable to verify device status. Sending was blocked"), "error");
        return;
      }
      const stateData = await stateRes.json();
      const mode = stateData?.runtime_mode;
      if (mode === "active" || mode === "interval") {
        setRuntimeMode(mode);
      }
      if (mode !== "active") {
        showToast(tr("设备处于间歇状态，不可发送", "Device is in interval mode and cannot receive content"), "error");
        return;
      }

      const previewResponse = await fetch(previewImg);
      if (!previewResponse.ok) throw new Error("preview image unavailable");
      const previewBlob = await previewResponse.blob();

      const qs = new URLSearchParams();
      qs.set("mode", previewMode);
      const res = await fetch(`/api/device/${encodeURIComponent(mac)}/apply-preview?${qs.toString()}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "image/png" }),
        body: previewBlob,
      });
      if (!res.ok) throw new Error("apply-preview failed");
      setCurrentMode(previewMode);
      await loadRuntimeMode();
      showToast(tr("已下发到墨水屏", "Sent to E-Ink"), "success");
    } catch {
      showToast(tr("下发失败", "Send failed"), "error");
    } finally {
      setApplyToScreenLoading(false);
    }
  };

  const handleApplySurfaceToScreen = async () => {
    if (!mac || !surfacePreviewImg || !assignedSurface) return;
    setSurfaceApplyToScreenLoading(true);
    try {
      const stateRes = await fetch(`/api/device/${encodeURIComponent(mac)}/state`, { cache: "no-store", headers: authHeaders() });
      if (!stateRes.ok) {
        showToast(tr("无法确认设备状态，已阻止发送", "Unable to verify device status. Sending was blocked"), "error");
        return;
      }
      const stateData = await stateRes.json();
      const mode = stateData?.runtime_mode;
      if (mode === "active" || mode === "interval") {
        setRuntimeMode(mode);
      }
      if (mode !== "active") {
        showToast(tr("设备处于间歇状态，不可发送", "Device is in interval mode and cannot receive content"), "error");
        return;
      }

      const previewResponse = await fetch(surfacePreviewImg);
      if (!previewResponse.ok) throw new Error("preview image unavailable");
      const previewBlob = await previewResponse.blob();

      const qs = new URLSearchParams();
      qs.set("mode", `SURFACE_${assignedSurface}`);
      const res = await fetch(`/api/device/${encodeURIComponent(mac)}/apply-preview?${qs.toString()}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "image/png" }),
        body: previewBlob,
      });
      if (!res.ok) throw new Error("apply-preview failed");
      setCurrentMode(`SURFACE_${assignedSurface}`);
      await loadRuntimeMode();
      showToast(tr("已下发到墨水屏", "Sent to E-Ink"), "success");
    } catch {
      showToast(tr("下发失败", "Send failed"), "error");
    } finally {
      setSurfaceApplyToScreenLoading(false);
    }
  };

  const handleAddCustomPersona = () => {
    const v = customPersonaTone.trim();
    if (!v) return;
    setCharacterTones((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCustomPersonaTone("");
  };

  const modeMeta = useMemo(() => {
    const map: Record<string, { name: string; tip: string }> = {};
    for (const item of catalogItems) {
      const mid = (item.mode_id || "").toUpperCase();
      if (!mid) continue;
      const lang = locale === "zh" ? item.i18n?.zh : locale === "hr" ? (item.i18n?.hr || item.i18n?.en) : item.i18n?.en;
      const name = (lang?.name && String(lang.name)) || (item.display_name && String(item.display_name)) || mid;
      const tip = (lang?.tip && String(lang.tip)) || (item.description && String(item.description)) || "";
      map[mid] = { name, tip };
    }
    return map;
  }, [catalogItems, locale]);

  const coreModes = useMemo(
    () => catalogItems.filter((m) => m.category === "core").map((m) => m.mode_id.toUpperCase()),
    [catalogItems],
  );
  const extraModes = useMemo(
    () => catalogItems.filter((m) => m.category === "more").map((m) => m.mode_id.toUpperCase()),
    [catalogItems],
  );
  const customModes = useMemo(
    () => catalogItems.filter((m) => m.category === "custom").map((m) => m.mode_id.toUpperCase()),
    [catalogItems],
  );
  const customModeMeta = useMemo(
    () =>
      Object.fromEntries(
        catalogItems
          .filter((m) => m.category === "custom")
          .map((m) => {
            const lang = locale === "zh" ? m.i18n?.zh : locale === "hr" ? (m.i18n?.hr || m.i18n?.en) : m.i18n?.en;
            return [
              m.mode_id.toUpperCase(),
              {
                name: (lang?.name && String(lang.name)) || m.display_name || m.mode_id,
                tip: (lang?.tip && String(lang.tip)) || m.description || "",
              },
            ];
          }),
      ),
    [catalogItems, locale],
  );
  const surfaceCatalog = useMemo(() => {
    const map = new Map<string, { id: string; name: string; tip: string; definition: Record<string, unknown> }>();
    for (const item of DEFAULT_SURFACE_LIBRARY) {
      map.set(item.id, {
        id: item.id,
        name: pickByLocale(locale, item.name),
        tip: pickByLocale(locale, item.tip),
        definition: { ...item.definition },
      });
    }
    const configured = Array.isArray(config.surfaces) ? config.surfaces : [];
    for (const raw of configured) {
      if (!raw || typeof raw !== "object") continue;
      const id = String((raw as Record<string, unknown>).id || "").trim();
      if (!id) continue;
      const existing = map.get(id);
      const rawName =
        typeof (raw as Record<string, unknown>).name === "string"
          ? String((raw as Record<string, unknown>).name).trim()
          : "";
      map.set(id, {
        id,
        name: rawName || existing?.name || id,
        tip: existing?.tip || tr("设备配置里的 Surface", "Surface from device config", "Surface iz konfiguracije uređaja"),
        definition: { ...(raw as Record<string, unknown>), id, type: "surface" },
      });
    }
    for (const [id, draft] of Object.entries(surfaceDrafts)) {
      if (!id) continue;
      const existing = map.get(id);
      const draftName =
        typeof (draft as Record<string, unknown>)?.name === "string"
          ? String((draft as Record<string, unknown>).name).trim()
          : "";
      map.set(id, {
        id,
        name: draftName || existing?.name || id,
        tip: existing?.tip || tr("自定义 Surface", "Custom surface", "Prilagođeni surface"),
        definition: { ...(existing?.definition || {}), ...(draft || {}), id, type: "surface" },
      });
    }
    return Array.from(map.values());
  }, [config.surfaces, locale, surfaceDrafts, tr]);

  const simulatedPreviewSurfaceId = useMemo(() => {
    const valid = new Set(surfaceCatalog.map((s) => s.id));
    return effectivePreviewSurfaceId(
      surfacePlaybackMode,
      assignedSurface,
      surfacePlaylist,
      surfaceSchedule,
      valid,
      new Date(),
    );
  }, [surfaceCatalog, surfacePlaybackMode, assignedSurface, surfacePlaylist, surfaceSchedule]);

  const updateSurfaceSlotMode = useCallback(
    (surfaceId: string, target: SurfaceSlotEditTarget, modeId: string, memoText?: string) => {
      const mid = (modeId || "STOIC").toUpperCase();
      setSurfaceDrafts((prev) => {
        const cat = surfaceCatalog.find((s) => s.id === surfaceId);
        const current = { ...(cat?.definition || {}) } as Record<string, unknown>;
        if (!cat && Object.keys(current).length === 0) return prev;

        if (target.type === "grid") {
          const raw = Array.isArray(current.slots) ? ([...current.slots] as SurfaceGridSlot[]) : [];
          const slots = raw.map((s) => ({ ...s }));
          const si = slots.findIndex((s) => String(s.id || "") === target.slotId);
          if (si < 0) return prev;
          slots[si] = { ...slots[si], mode_id: mid, mode: mid };
          const ordered = sortSurfaceSlotsReadingOrder(slots);
          const layout = ordered.map((s, i) => {
            const m = String(s.mode_id || s.mode || "STOIC").toUpperCase();
            const blk: Record<string, unknown> = { mode: m, position: `slot_${i}` };
            if (s.id) blk.slot_id = s.id;
            if (m === "MEMO" && String(s.id || "") === target.slotId) {
              const t = (memoText ?? "").trim();
              if (t) blk.memo_text = t;
            }
            return blk;
          });
          return {
            ...prev,
            [surfaceId]: {
              ...current,
              id: surfaceId,
              type: "surface",
              slots,
              layout,
            },
          };
        }

        const position = target.position;
        const shell =
          Object.keys(current).length > 0
            ? current
            : ({
                id: surfaceId,
                type: "surface",
                refresh: { mode: "hybrid", interval: 300 },
                rules: [],
              } as Record<string, unknown>);
        const existingLayout = Array.isArray(shell.layout) ? (shell.layout as Array<Record<string, unknown>>) : [];
        const filtered = existingLayout.filter((item) => String(item.position || "") !== position);
        const block: Record<string, unknown> = { mode: mid, position };
        if (mid === "MEMO") {
          const t = (memoText ?? "").trim();
          if (t) block.memo_text = t;
        }
        const nextLayout = [...filtered, block].sort((a, b) => {
          const order = { top: 0, middle: 1, bottom: 2 } as const;
          return (
            (order[String(a.position || "middle") as keyof typeof order] ?? 1) -
            (order[String(b.position || "middle") as keyof typeof order] ?? 1)
          );
        });
        return {
          ...prev,
          [surfaceId]: {
            ...shell,
            id: surfaceId,
            type: "surface",
            layout: nextLayout,
          },
        };
      });
    },
    [surfaceCatalog],
  );

  const applySurfaceLayoutFromDialog = useCallback(
    (payload: {
      grid: { columns: number; rows: number; gap: number; padding: number };
      slots: SurfaceGridSlot[];
      layout: Array<Record<string, unknown>>;
    }) => {
      const sid = surfaceLayoutEditorId.trim();
      if (!sid) return;
      const cat = surfaceCatalog.find((s) => s.id === sid);
      const current = { ...(cat?.definition || {}) } as Record<string, unknown>;
      setSurfaceDrafts((prev) => ({
        ...prev,
        [sid]: {
          ...current,
          id: sid,
          type: "surface",
          grid: normalizeSurfaceGridSpec(payload.grid),
          slots: payload.slots,
          layout: payload.layout,
        },
      }));
      showToast(tr("已应用版面", "Layout applied", "Raspored je primijenjen"), "success");
    },
    [surfaceLayoutEditorId, surfaceCatalog, showToast, tr],
  );

  const onSurfaceWizardComplete = useCallback(
    (payload: {
      id: string;
      displayName: string;
      grid: ReturnType<typeof buildGridSpec>;
      slots: SurfaceGridSlot[];
      layout: Array<Record<string, unknown>>;
    }) => {
      setSurfaceDrafts((prev) => ({
        ...prev,
        [payload.id]: {
          id: payload.id,
          type: "surface",
          name: payload.displayName,
          grid: payload.grid,
          slots: payload.slots,
          layout: payload.layout,
          refresh: { mode: "hybrid", interval: 300 },
          rules: [],
        },
      }));
      setSurfacePlaylist((pl) => {
        if (pl.some((p) => p.surface_id === payload.id)) return pl;
        const next = [
          ...pl,
          { surface_id: payload.id, enabled: true, duration_sec: 300, order: pl.length },
        ];
        return next.map((p, order) => ({ ...p, order }));
      });
      setDeviceRenderMode("surface");
      setAssignedSurface(payload.id);
      setSurfacePreviewTarget(payload.id);
      setSurfaceLayoutEditorId(payload.id);
      showToast(tr("已创建自定义 Surface", "Created custom surface", "Kreiran prilagođeni surface"), "success");
    },
    [showToast, tr],
  );

  const activeSurfaceDefinition = useMemo(
    () =>
      surfaceCatalog.find((s) => s.id === (surfaceLayoutEditorId || surfacePreviewTarget || assignedSurface))?.definition ||
      null,
    [assignedSurface, surfaceCatalog, surfaceLayoutEditorId, surfacePreviewTarget],
  );

  const layoutEditorSurfaceDefinition = useMemo(() => {
    const id = surfaceLayoutEditorId;
    if (!id) return null;
    return surfaceCatalog.find((s) => s.id === id)?.definition ?? null;
  }, [surfaceCatalog, surfaceLayoutEditorId]);

  const surfaceEditorUsesGrid = useMemo(
    () => surfaceUsesGridSlots(layoutEditorSurfaceDefinition),
    [layoutEditorSurfaceDefinition],
  );

  const surfaceEditorGridSlots = useMemo(() => {
    if (!layoutEditorSurfaceDefinition || !surfaceUsesGridSlots(layoutEditorSurfaceDefinition)) return null;
    const slots = (layoutEditorSurfaceDefinition.slots as SurfaceGridSlot[]) || [];
    return sortSurfaceSlotsReadingOrder(slots);
  }, [layoutEditorSurfaceDefinition]);

  const surfaceEditorSlotItems = useMemo(() => {
    const id = surfaceLayoutEditorId;
    if (!id) return { top: null, middle: null, bottom: null } as const;
    const def = surfaceCatalog.find((s) => s.id === id)?.definition;
    const layout = Array.isArray(def?.layout) ? (def.layout as Array<Record<string, unknown>>) : [];
    return {
      top: layout.find((x) => String(x.position || "") === "top") ?? null,
      middle: layout.find((x) => String(x.position || "") === "middle") ?? null,
      bottom: layout.find((x) => String(x.position || "") === "bottom") ?? null,
    } as const;
  }, [surfaceCatalog, surfaceLayoutEditorId]);

  const activeSurfaceDisplayName = useMemo(() => {
    const id = (surfaceLayoutEditorId || surfacePreviewTarget || assignedSurface || "").trim();
    if (!id) return tr("请选择 Surface", "Select a surface", "Odaberi surface");
    return surfaceCatalog.find((s) => s.id === id)?.name || id;
  }, [surfaceCatalog, surfaceLayoutEditorId, surfacePreviewTarget, assignedSurface, tr]);

  const fetchLiveSurfacePreview = useCallback(
    async (surfaceIdOverride?: string) => {
      const sid = (surfaceIdOverride || surfaceLayoutEditorId || assignedSurface || "").trim();
      if (!sid) return;
      const defPreview = surfaceCatalog.find((s) => s.id === sid)?.definition;
      if (surfaceHasEmptyGridSlot(defPreview)) {
        showToast(
          tr("请先为所有槽位分配模式再预览", "Assign a mode to every slot before preview", "Dodijeli mod svakom slotu prije pregleda"),
          "error",
        );
        return;
      }
      setSurfacePreviewLoading(true);
      setSurfacePreviewStatusText(tr("正在生成 Surface 预览...", "Generating surface preview...", "Generiram surface pregled..."));
      try {
        const surfaceDef =
          surfaceCatalog.find((s) => s.id === sid)?.definition ||
          (sid === assignedSurface ? activeSurfaceDefinition : null) ||
          null;
        if (!surfaceDef) throw new Error("missing surface definition");
        const body: Record<string, unknown> = {
          surface: surfaceDef,
          w: SURFACE_PREVIEW_W,
          h: SURFACE_PREVIEW_H,
        };
        if (mac?.trim()) body.mac = mac.trim();
        const res = await fetch("/api/preview/surface", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("surface preview failed");
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        replaceSurfacePreviewImg(objectUrl);
      } catch {
        showToast(tr("Surface 实时预览失败", "Surface live preview failed", "Surface live pregled nije uspio"), "error");
      } finally {
        setSurfacePreviewLoading(false);
        setSurfacePreviewStatusText("");
      }
    },
    [
      activeSurfaceDefinition,
      assignedSurface,
      mac,
      replaceSurfacePreviewImg,
      showToast,
      surfaceCatalog,
      surfaceLayoutEditorId,
      tr,
    ],
  );

  const openSurfaceLayoutEditor = useCallback((surfaceId: string) => {
    setDeviceRenderMode("surface");
    setAssignedSurface(surfaceId);
    setSurfacePreviewTarget(surfaceId);
    setSurfaceLayoutEditorId(surfaceId);
    surfacePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const openSurfaceSlotModal = useCallback(
    (surfaceId: string, target: SurfaceSlotEditTarget) => {
      const def = surfaceCatalog.find((s) => s.id === surfaceId)?.definition;
      const layout = (def?.layout as Array<Record<string, unknown>> | undefined) || [];
      if (target.type === "grid") {
        const slots = (def?.slots as SurfaceGridSlot[]) || [];
        const slot = slots.find((s) => String(s.id || "") === target.slotId);
        const block = layout.find((b) => String(b.slot_id || "") === target.slotId);
        const modeSource = block || slot || null;
        setSurfaceSlotModalMode(resolveSurfaceSlotMode(modeSource as Record<string, unknown>) || "STOIC");
        setSurfaceSlotModalMemo(typeof block?.memo_text === "string" ? block.memo_text : "");
        setSurfaceSlotModal({ kind: "grid", surfaceId, slotId: target.slotId });
        return;
      }
      const item = layout.find((x) => String(x.position || "") === target.position);
      setSurfaceSlotModalMode(resolveSurfaceSlotMode(item) || "STOIC");
      setSurfaceSlotModalMemo(typeof item?.memo_text === "string" ? item.memo_text : "");
      setSurfaceSlotModal({ kind: "legacy", surfaceId, position: target.position });
    },
    [surfaceCatalog],
  );

  const confirmSurfaceSlotModal = useCallback(() => {
    if (!surfaceSlotModal) return;
    if (surfaceSlotModal.kind === "grid") {
      updateSurfaceSlotMode(
        surfaceSlotModal.surfaceId,
        { type: "grid", slotId: surfaceSlotModal.slotId },
        surfaceSlotModalMode,
        surfaceSlotModalMode === "MEMO" ? surfaceSlotModalMemo : undefined,
      );
    } else {
      updateSurfaceSlotMode(
        surfaceSlotModal.surfaceId,
        { type: "legacy", position: surfaceSlotModal.position },
        surfaceSlotModalMode,
        surfaceSlotModalMode === "MEMO" ? surfaceSlotModalMemo : undefined,
      );
    }
    setSurfaceSlotModal(null);
  }, [surfaceSlotModal, surfaceSlotModalMemo, surfaceSlotModalMode, updateSurfaceSlotMode]);

  const surfaceSlotModeChoices = useMemo(() => {
    const base = catalogItems.filter((it) => it.mode_id.toUpperCase() !== "MY_ADAPTIVE");
    if (!surfaceSlotModal || surfaceSlotModal.kind !== "grid") return base;
    const def = surfaceCatalog.find((s) => s.id === surfaceSlotModal.surfaceId)?.definition;
    const slots = (def?.slots as SurfaceGridSlot[]) || [];
    const slot = slots.find((s) => String(s.id || "") === surfaceSlotModal.slotId);
    if (!slot) return base;
    const st = String(slot.slot_type || "SMALL").toUpperCase();
    return base.filter((it) => modeSupportsSlotTypeLiteral(it.supported_slot_types, st));
  }, [catalogItems, surfaceCatalog, surfaceSlotModal]);

  const activeModeSchema = settingsMode ? (modeSchemaMap[settingsMode] || []) : [];

  const batteryPct = stats?.last_battery_voltage
    ? Math.min(100, Math.max(0, Math.round((stats.last_battery_voltage / 3.3) * 100)))
    : null;
  const currentDeviceMembership = userDevices.find((d) => d.mac.toUpperCase() === mac.toUpperCase()) || null;
  const denyByMembership = Boolean(mac && currentUser && !devicesLoading && !currentDeviceMembership);
  const currentUserRole = currentDeviceMembership?.role || "";
  const formatPreviewConfirmText = useCallback((usageSource?: string) => {
    switch (usageSource) {
      case "current_user_api_key":
        return tr("本次预览将使用你的 API key。是否继续？", "This preview will use your API key. Continue?");
      case "owner_api_key":
        return ownerUsername
          ? tr(`本次预览将使用 owner（${ownerUsername}）的 API key。是否继续？`, `This preview will use ${ownerUsername}'s API key. Continue?`)
          : tr("本次预览将使用 owner 的 API key。是否继续？", "This preview will use the owner's API key. Continue?");
      case "owner_free_quota":
        return ownerUsername
          ? tr(`本次预览将消耗 owner（${ownerUsername}）的免费额度。是否继续？`, `This preview will use ${ownerUsername}'s free quota. Continue?`)
          : tr("本次预览将消耗 owner 的免费额度。是否继续？", "This preview will use the owner's free quota. Continue?");
      case "current_user_free_quota":
        return tr("本次预览将消耗你的免费额度。是否继续？", "This preview will use your free quota. Continue?");
      default:
        return tr("当前未命中缓存，将生成新的预览。是否继续？", "No cache hit. A new preview will be generated. Continue?");
    }
  }, [ownerUsername, tr]);
  const statusLabel = !isOnline
    ? tr("离线", "Offline")
    : runtimeMode === "active"
    ? tr("活跃状态", "Active")
    : tr("间歇状态", "Interval");
  const statusClass = !isOnline
    ? "bg-paper-dark text-ink-light border border-ink/10"
    : runtimeMode === "active"
    ? "bg-green-50 text-green-700 border border-green-200"
    : "bg-amber-50 text-amber-700 border border-amber-200";
  const statusIconClass = !isOnline
    ? "text-ink-light"
    : runtimeMode === "active"
    ? "text-green-600"
    : "text-amber-600";
  const tabs = useMemo(
    () =>
      TABS.map((tab) => ({
        id: tab.id,
        icon: tab.icon,
        label: pickByLocale(locale, tab.label),
      })),
    [locale],
  );

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
          setAdaptiveUploading(true);
          try {
            const url = await uploadLocalImage(f);
            const pending = pendingAdaptiveAction;
            setPendingAdaptiveAction(null);
            await commitModalAction("MY_ADAPTIVE", pending?.action || "preview", { image_url: url } as ModeOverride);
          } catch (err) {
            const msg = err instanceof Error ? err.message : tr("请选择一张本地图片", "Please choose a local image", "Odaberi lokalnu sliku");
            showToast(msg, "error");
          } finally {
            setAdaptiveUploading(false);
          }
        }}
      />
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-ink mb-2">{tr("设备配置", "Device Configuration", "Konfiguracija uređaja")}</h1>
        {currentUser === undefined ? (
          <div className="flex items-center gap-2 text-ink-light text-sm py-4">
            <Loader2 size={16} className="animate-spin" /> {tr("加载中...", "Loading...", "Učitavanje...")}
          </div>
        ) : currentUser === null ? (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{tr("请先登录", "Please sign in first", "Najprije se prijavi")}</p>
              <p className="text-xs mt-0.5">{mac ? tr("登录后才能配置设备。", "Sign in to configure this device.", "Prijavi se kako bi konfigurirao ovaj uređaj.") : tr("登录后可以管理你的设备列表。", "Sign in to manage your device list.", "Prijavi se kako bi upravljao svojim uređajima.")}</p>
              <Link href={`${withLocalePath(locale, "/login")}?next=${encodeURIComponent(nextConfigPath)}`}>
                <Button size="sm" className="mt-2">{tr("登录 / 注册", "Sign In / Sign Up", "Prijava / Registracija")}</Button>
              </Link>
            </div>
          </div>
        ) : (macAccessDenied || denyByMembership) ? (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{tr("无权访问该设备", "No permission to access this device", "Nemaš pristup ovom uređaju")}</p>
              <p className="text-xs mt-0.5">{tr("该设备未绑定到当前账号，或你不是被授权成员。", "This device is not bound to your account, or you are not an authorized member.", "Ovaj uređaj nije vezan uz tvoj račun ili nisi ovlašteni član.")}</p>
              <Link href={withLocalePath(locale, "/config")}>
                <Button size="sm" variant="outline" className="mt-2">{tr("返回设备列表", "Back to Device List", "Natrag na listu uređaja")}</Button>
              </Link>
            </div>
          </div>
        ) : mac ? (
          <DeviceInfo
            mac={mac}
            currentUserRole={currentUserRole}
            statusIconClass={statusIconClass}
            statusClass={statusClass}
            statusLabel={statusLabel}
            lastSeen={lastSeen}
            isEn={isEn}
            locale={locale}
            localeConfigPath={withLocalePath(locale, "/config")}
            tr={tr}
            isFocusListening={isFocusListening}
            onToggleFocus={handleToggleFocusListening}
            focusToggleLoading={focusToggleLoading}
          />
        ) : (
          <div className="space-y-4">
            {requestsLoading ? (
              <div className="flex items-center gap-2 text-ink-light text-sm py-2">
                <Loader2 size={16} className="animate-spin" /> {tr("加载待处理请求...", "Loading pending requests...", "Učitavam zahtjeve na čekanju...")}
              </div>
            ) : pendingRequests.length > 0 ? (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
                <p className="text-sm font-medium text-amber-900 mb-2">{tr("待你处理的绑定请求", "Pending binding requests", "Zahtjevi za vezanje koji čekaju tvoju potvrdu")}</p>
                <div className="space-y-2">
                  {pendingRequests.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-amber-900">{item.requester_username}</p>
                        <p className="text-xs text-amber-800 font-mono">{item.mac}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleRejectRequest(item.id)}>{tr("拒绝", "Reject", "Odbij")}</Button>
                        <Button size="sm" onClick={() => handleApproveRequest(item.id)}>{tr("同意", "Approve", "Odobri")}</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="p-3 rounded-xl border border-ink/10 bg-paper">
              <p className="text-sm font-medium text-ink mb-2 flex items-center gap-1">
                <Monitor size={14} /> {tr("配对设备", "Pair Device", "Upari uređaj")}
              </p>
              <p className="text-xs text-ink-light mb-3">{tr("在设备配网页查看配对码，输入后即可认领或申请绑定设备。", "Find the pair code in the device portal page, then claim or request binding.", "Na provisioning stranici uređaja pronađi kod za uparivanje, pa zatraži ili potvrdi vezanje uređaja.")}</p>
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  value={pairCodeInput}
                  onChange={(e) => setPairCodeInput(e.target.value.toUpperCase())}
                  placeholder={tr("配对码", "Pair Code", "Kod za uparivanje")}
                  className="w-full sm:w-64 rounded-xl border border-ink/20 px-3 py-1.5 text-sm font-mono uppercase tracking-[0.2em]"
                />
                <Button size="sm" variant="outline" onClick={handlePairDevice} disabled={!pairCodeInput.trim() || pairingDevice}>
                  {pairingDevice ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  {tr("立即配对", "Pair Now", "Upari odmah")}
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-ink/10 bg-paper">
              <p className="text-sm font-medium text-ink mb-2 flex items-center gap-1">
                <Plus size={14} /> {tr("按 MAC 手动绑定", "Bind by MAC", "Veži po MAC adresi")}
              </p>
              <p className="text-xs text-ink-light mb-3">{tr("请优先使用配对码配对。", "Pair code is recommended first.", "Preporučuje se prvo korištenje koda za uparivanje.")}</p>
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  value={bindMacInput}
                  onChange={(e) => setBindMacInput(e.target.value)}
                  placeholder={tr("MAC 地址 (如 AA:BB:CC:DD:EE:FF)", "MAC address (e.g. AA:BB:CC:DD:EE:FF)", "MAC adresa (npr. AA:BB:CC:DD:EE:FF)")}
                  className="w-full sm:w-[360px] rounded-xl border border-ink/20 px-3 py-1.5 text-sm font-mono"
                />
                <input
                  value={bindNicknameInput}
                  onChange={(e) => setBindNicknameInput(e.target.value)}
                  placeholder={tr("别名（可选）", "Nickname (optional)", "Nadimak (opcionalno)")}
                  className="w-32 rounded-xl border border-ink/20 px-3 py-1.5 text-sm"
                />
                <Button size="sm" variant="outline" onClick={async () => {
                  const targetMac = bindMacInput.trim();
                  if (!targetMac) return;
                  const result = await handleBindDevice(targetMac, bindNicknameInput.trim());
                  if (!result) return;
                  if (result.status === "claimed" || result.status === "active") {
                    showToast(tr("设备已绑定", "Device bound", "Uređaj je povezan"), "success");
                    window.location.href = `${withLocalePath(locale, "/config")}?mac=${encodeURIComponent(targetMac)}`;
                    return;
                  }
                  if (result.status === "pending_approval") {
                    showToast(tr("已提交绑定申请，等待 owner 同意", "Binding request submitted. Waiting for owner approval", "Zahtjev za vezanje je poslan. Čeka se odobrenje vlasnika."), "info");
                  }
                }}>
                  {tr("绑定", "Bind", "Poveži")}
                </Button>
              </div>
            </div>

            {/* Device list */}
            {devicesLoading ? (
              <div className="flex items-center gap-2 text-ink-light text-sm py-4">
                <Loader2 size={16} className="animate-spin" /> {tr("加载设备列表...", "Loading devices...", "Učitavam listu uređaja...")}
              </div>
            ) : userDevices.length > 0 ? (
              <div className="space-y-2">
                {userDevices.map((d) => (
                  <div key={d.mac} className="flex items-center justify-between p-3 rounded-xl border border-ink/10 bg-paper hover:border-ink/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Monitor size={18} className="text-ink-light" />
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {d.nickname || d.mac}
                        </p>
                        {d.nickname && (
                          <p className="text-xs text-ink-light font-mono">{d.mac}</p>
                        )}
                        <p className="text-xs text-ink-light">
                          {tr("权限", "Role", "Uloga")}: {d.role === "owner" ? "Owner" : "Member"}
                        </p>
                        <p className="text-xs text-ink-light">
                          {d.last_seen
                            ? `${tr("上次在线", "Last seen", "Zadnji put online")}: ${new Date(d.last_seen).toLocaleString(locale === "zh" ? "zh-CN" : locale === "hr" ? "hr-HR" : "en-US")}`
                            : tr("尚未上线", "Never online", "Još nije bio online")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`${withLocalePath(locale, "/config")}?mac=${encodeURIComponent(d.mac)}`}>
                        <Button size="sm" variant="outline">
                          <Settings size={14} className="mr-1" /> {tr("配置", "Configure", "Konfiguriraj")}
                        </Button>
                      </Link>
                      <button
                        onClick={() => handleUnbindDevice(d.mac)}
                        className="p-1.5 text-ink-light hover:text-red-600 transition-colors"
                        title={tr("解绑设备", "Unbind device", "Odveži uređaj")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{tr("未绑定设备", "No bound devices", "Nema povezanih uređaja")}</p>
                  <p className="text-xs mt-0.5">{tr("当前账号下还没有设备。", "There are no devices under this account yet.", "Trenutno nema uređaja povezanih s ovim računom.")}</p>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {mac && currentUser && !(macAccessDenied || denyByMembership) && loading && (
        <div className="flex items-center justify-center py-20 text-ink-light">
          <Loader2 size={24} className="animate-spin mr-2" /> {tr("加载配置中...", "Loading configuration...", "Učitavam konfiguraciju...")}
        </div>
      )}

      {mac && currentUser && !(macAccessDenied || denyByMembership) && !loading && (
        <div className="space-y-4">
          <div className="flex gap-6">
            {/* Sidebar tabs */}
            <nav className="w-44 shrink-0 hidden md:block">
            <div className="sticky top-24 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    activeTab === tab.id
                      ? "bg-ink text-white font-medium"
                      : "text-ink-light hover:bg-paper-dark hover:text-ink"
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
              <div className="pt-4">
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={!mac || saving}
                  className="w-full bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                  {tr("保存到设备", "Save to Device", "Spremi na uređaj")}
                </Button>
              </div>
            </div>
          </nav>

            {/* Mobile tabs */}
            <div className="md:hidden w-full mb-4 overflow-x-auto">
            <div className="flex gap-1 min-w-max pb-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "bg-ink text-white" : "bg-paper-dark text-ink-light"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
            {/* Modes Tab */}
            {activeTab === "modes" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[520px_1fr] gap-6 items-start">
                  <ModeSelector
                    tr={tr}
                    selectedModes={selectedModes}
                    customModes={customModes}
                    customModeMeta={customModeMeta}
                    modeMeta={modeMeta}
                    coreModes={coreModes}
                    extraModes={extraModes}
                    handleModePreview={handleModePreview}
                    handleModeApply={handleModeApply}
                    handleCustomModeDelete={handleCustomModeDelete}
                    setEditingCustomMode={setEditingCustomMode}
                    setCustomDesc={setCustomDesc}
                    setCustomModeName={setCustomModeName}
                    setCustomJson={setCustomJson}
                    previewColors={previewColors}
                    onColorsChange={setPreviewColors}
                  />

                  <div ref={previewPanelRef}>
                  <EInkPreviewPanel
                    tr={tr}
                    previewModeLabel={
                      previewModeLabelOverride ||
                      (previewMode
                        ? (modeMeta[previewMode]?.name || customModeMeta[previewMode]?.name || previewMode)
                        : tr("请选择模式", "Select a mode", "Odaberi mod"))
                    }
                    previewLoading={previewLoading}
                    previewStatusText={previewStatusText}
                    previewImg={previewImg}
                    previewCacheHit={previewCacheHit}
                    previewLlmStatus={previewLlmStatus}
                    canApplyToScreen={Boolean(mac && previewMode && previewImg)}
                    applyToScreenLoading={applyToScreenLoading}
                    onRegenerate={() => handlePreview(previewMode, true)}
                    onApplyToScreen={handleApplyPreviewToScreen}
                    rightActions={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveCustomMode}
                        disabled={!(customEditorSource === "ai" && Boolean(customJson.trim()))}
                        className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
                      >
                        {tr("保存模式", "Save Mode", "Spremi mod")}
                      </Button>
                    }
                  />
                  </div>
                </div>

                <Dialog
                  open={editingCustomMode}
                  onClose={() => {
                    setEditingCustomMode(false);
                  }}
                >
                  <DialogContent className="max-w-2xl">
                    <DialogHeader
                      onClose={() => {
                        setEditingCustomMode(false);
                      }}
                    >
                      <div>
                        <DialogTitle>{tr("创建自定义模式", "Create Custom Mode", "Izradi prilagođeni mod")}</DialogTitle>
                        <DialogDescription>
                          {tr(
                            "用一句话描述你想要的模式，点击 AI 生成预览，右侧水墨屏会显示效果。",
                            "Describe the mode you want, click AI Generate Preview, and the right E-Ink panel will show the result.",
                            "U jednoj rečenici opiši mod koji želiš, klikni AI Generate Preview, a desni E-Ink panel će prikazati rezultat.",
                          )}
                        </DialogDescription>
                      </div>
                    </DialogHeader>

                    <div className="space-y-3">
                      {customGenerating ? (
                        <div className="rounded-xl border border-ink/10 bg-paper px-3 py-3 text-sm text-ink-light flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          {tr("模式生成中...", "Generating mode...", "Generiram mod...")}
                        </div>
                      ) : null}
                      <textarea
                        value={customDesc}
                        onChange={(e) => {
                          setCustomDesc(e.target.value);
                          setCustomEditorSource("manual");
                        }}
                        rows={3}
                        maxLength={2000}
                        placeholder={tr(
                          "描述你想要的模式，如：每天显示一个英语单词和释义，单词要大号字体居中",
                          "Describe your mode, e.g. show one English word and definition daily with a large centered font",
                          "Opiši svoj mod, npr. svaki dan prikaži jednu englesku riječ i definiciju s velikim centriranim fontom",
                        )}
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm resize-y bg-white"
                        disabled={customGenerating}
                      />

                      <input
                        value={customModeName}
                        onChange={(e) => {
                          setCustomModeName(e.target.value);
                          setCustomEditorSource((v) => v || "manual");
                        }}
                        placeholder={tr("模式名称（例如：今日英语）", "Mode name (e.g. Daily English)", "Naziv moda (npr. Dnevni engleski)")}
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                        disabled={customGenerating}
                      />

                      <Button
                        size="sm"
                        onClick={() => {
                          // Keep the dialog open while generating; it will auto-close after generation finishes.
                          void handleGenerateMode();
                        }}
                        disabled={customGenerating || !customDesc.trim()}
                      >
                        {tr("AI 生成预览", "AI Generate Preview", "AI generiraj pregled")}
                      </Button>

                      {customEditorSource === "ai" ? (
                        <div className="text-[11px] text-ink-light">
                          {tr("AI 生成的模式可在右侧预览后直接保存。", "AI-generated modes can be saved from the right preview panel.", "AI generirani mod možeš spremiti izravno iz desnog preview panela.")}
                        </div>
                      ) : null}
                    </div>
                  </DialogContent>
                </Dialog>

              </div>
            )}

            {/* Surfaces Tab */}
            {activeTab === "surfaces" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[520px_1fr] gap-6 items-start">
                  <div className="space-y-6 min-w-0">
                    <Card>
                      <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <CardTitle className="text-base">{tr("Surface 库", "Surface library", "Surface biblioteka")}</CardTitle>
                          <Button type="button" variant="outline" size="sm" className="text-xs shrink-0" onClick={() => setSurfaceCreateWizardOpen(true)}>
                            <Plus size={14} className="mr-1 inline" />
                            {tr("新建自定义", "New custom", "Novi prilagođeni")}
                          </Button>
                        </div>
                        <p className="text-xs text-ink-light font-normal mt-1">
                          {tr(
                            "点击卡片打开下方布局；点每个区域在弹窗里选择组件；最后在右侧点「重新生成预览」。",
                            "Click a surface to open the layout below, tap each zone to pick a widget in the dialog, then use “Regenerate Preview” on the right.",
                            "Klikni surface za layout ispod, zone za widget u dijalogu, zatim „Ponovno generiraj pregled” desno.",
                          )}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {surfaceCatalog.map((surface) => {
                            const inPlaylist = surfacePlaylistContains(surface.id);
                            const isDefault = assignedSurface === surface.id;
                            const isEditing = surfaceLayoutEditorId === surface.id;
                            const g = surface.definition.grid as { columns?: number; rows?: number } | undefined;
                            const slotCount = Array.isArray(surface.definition.slots) ? surface.definition.slots.length : 0;
                            const mini = g ? `${g.columns ?? "?"}×${g.rows ?? "?"} · ${slotCount}` : "—";
                            return (
                              <div
                                key={surface.id}
                                className="flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white"
                              >
                                <button
                                  type="button"
                                  onClick={() => openSurfaceLayoutEditor(surface.id)}
                                  className={`flex min-h-[72px] w-full shrink-0 flex-col justify-start overflow-hidden px-3 py-2 text-left transition-colors ${
                                    isEditing
                                      ? "bg-ink text-white ring-2 ring-inset ring-white/35"
                                      : isDefault
                                        ? "bg-ink/90 text-white"
                                        : "hover:bg-paper-dark text-ink"
                                  }`}
                                  title={surface.tip}
                                >
                                  <div className="text-sm font-semibold leading-tight line-clamp-2">{surface.name}</div>
                                  <div className="text-[10px] uppercase text-ink-light mt-0.5">
                                    {isPresetSurfaceId(surface.id)
                                      ? tr("预设", "Preset", "Predložak")
                                      : tr("自定义", "Custom", "Prilagođeno")}
                                  </div>
                                  <div className="mt-1 font-mono text-[10px] text-ink-light">{mini}</div>
                                  <div
                                    className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${isEditing || isDefault ? "text-white/85" : "text-ink-light"}`}
                                  >
                                    {surface.tip}
                                  </div>
                                </button>
                                <div className="grid grid-cols-2 gap-px border-t border-ink/10 bg-ink/10 text-[10px]">
                                  <button
                                    type="button"
                                    className="bg-white py-1.5 hover:bg-ink hover:text-white text-ink"
                                    onClick={() =>
                                      inPlaylist ? removeSurfaceFromPlaylist(surface.id) : addSurfaceToPlaylist(surface.id)
                                    }
                                  >
                                    {inPlaylist
                                      ? tr("从播放列表移除", "Remove from playlist", "Ukloni s playliste")
                                      : tr("加入播放列表", "Add to playlist", "Dodaj na playlistu")}
                                  </button>
                                  <button
                                    type="button"
                                    className="bg-white py-1.5 hover:bg-ink hover:text-white text-ink"
                                    onClick={() => {
                                      setAssignedSurface(surface.id);
                                      showToast(tr("已设为默认 Surface", "Set as default surface", "Postavljeno kao zadano"), "success");
                                    }}
                                  >
                                    {tr("设为默认", "Set default", "Zadano")}
                                  </button>
                                  {!isPresetSurfaceId(surface.id) ? (
                                    <button
                                      type="button"
                                      className="col-span-2 bg-white py-1.5 hover:bg-red-600 hover:text-white text-red-700"
                                      onClick={() => {
                                        if (!window.confirm(tr("删除该自定义 Surface？", "Delete this custom surface?", "Obrisati surface?"))) return;
                                        setSurfaceDrafts((prev) => {
                                          const n = { ...prev };
                                          delete n[surface.id];
                                          return n;
                                        });
                                        setSurfacePlaylist((pl) =>
                                          pl.filter((p) => p.surface_id !== surface.id).map((p, order) => ({ ...p, order })),
                                        );
                                        if (assignedSurface === surface.id) setAssignedSurface("work");
                                        if (surfaceLayoutEditorId === surface.id) {
                                          setSurfaceLayoutEditorId("");
                                          replaceSurfacePreviewImg(null);
                                        }
                                        showToast(tr("已删除", "Deleted", "Obrisano"), "success");
                                      }}
                                    >
                                      {tr("删除自定义", "Delete custom", "Obriši")}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{tr("播放模式", "Playback mode", "Način reprodukcije")}</CardTitle>
                        <p className="text-xs text-ink-light font-normal mt-1">
                          {tr(
                            "single：仅默认 Surface；rotate：按播放列表轮换；scheduled：按日程表。",
                            "Single: default surface only. Rotate: playlist. Scheduled: time blocks.",
                            "Single: zadani surface. Rotate: playlist. Scheduled: raspored.",
                          )}
                        </p>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {(
                          [
                            ["single", tr("单一", "Single", "Jedan")],
                            ["rotate", tr("轮换", "Rotate", "Rotacija")],
                            ["scheduled", tr("日程", "Scheduled", "Raspored")],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setSurfacePlaybackMode(v)}
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              surfacePlaybackMode === v ? "bg-ink text-white border-ink" : "bg-white text-ink border-ink/20"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{tr("设备轮换", "Device rotation", "Rotacija uređaja")}</CardTitle>
                        <p className="text-xs text-ink-light font-normal mt-1">
                          {tr("启用项按顺序与时长轮换（播放模式为「轮换」时生效）。", "Enabled items rotate in order when playback is Rotate.", "Kad je Rotate, aktivne stavke se izmjenjuju.")}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <SurfacePlaylistEditor
                          playlist={surfacePlaylist}
                          onChange={setSurfacePlaylist}
                          surfaceOptions={surfaceCatalog.map((s) => ({ id: s.id, name: s.name }))}
                          tr={tr}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{tr("每日日程", "Daily schedule", "Dnevni raspored")}</CardTitle>
                        <p className="text-xs text-ink-light font-normal mt-1">
                          {tr("仅在播放模式为「日程」时使用；无匹配时回退默认 Surface。", "Used when playback is Scheduled; otherwise falls back to default.", "Za Scheduled; inače zadano.")}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <SurfaceScheduleEditor
                          schedule={surfaceSchedule}
                          onChange={setSurfaceSchedule}
                          surfaceOptions={surfaceCatalog.map((s) => ({ id: s.id, name: s.name }))}
                          tr={tr}
                        />
                      </CardContent>
                    </Card>

                    <SurfaceCreateWizard
                      open={surfaceCreateWizardOpen}
                      onClose={() => setSurfaceCreateWizardOpen(false)}
                      presetIds={DEFAULT_SURFACE_LIBRARY.map((p) => p.id)}
                      duplicateOptions={surfaceCatalog.map((s) => ({ id: s.id, name: s.name }))}
                      getDefinition={(sid) => {
                        const hit = surfaceCatalog.find((s) => s.id === sid);
                        return hit ? hit.definition : null;
                      }}
                      tr={tr}
                      onComplete={onSurfaceWizardComplete}
                    />

                    {surfaceLayoutEditorId ? (
                      <Card>
                        <CardHeader>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-base">
                                {tr("布局", "Layout", "Raspored")} · {surfaceCatalog.find((s) => s.id === surfaceLayoutEditorId)?.name || surfaceLayoutEditorId}
                              </CardTitle>
                              <p className="text-xs text-ink-light font-normal mt-1">
                                {tr("点击区域选择组件", "Tap a zone to choose a widget", "Klikni zonu za odabir widgeta")}
                              </p>
                            </div>
                            {surfaceEditorUsesGrid ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-xs shrink-0"
                                onClick={() => setSurfaceLayoutDialogOpen(true)}
                              >
                                {tr("编辑版面…", "Edit layout…", "Uredi raspored…")}
                              </Button>
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="rounded-2xl border border-ink/8 bg-linear-to-b from-[#fafafa] to-[#f0f0f2] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] w-full min-h-[280px]">
                            <div
                              className="h-full w-full"
                              style={
                                surfaceEditorUsesGrid && layoutEditorSurfaceDefinition
                                  ? gridStyleFromSurfaceDefinition(layoutEditorSurfaceDefinition)
                                  : legacySurfaceMosaicGridStyle(surfaceLayoutEditorId)
                              }
                            >
                              {surfaceEditorUsesGrid && surfaceEditorGridSlots && layoutEditorSurfaceDefinition
                                ? surfaceEditorGridSlots.map((slot) => {
                                    const slotId = String(slot.id || "");
                                    const layoutBlocks = Array.isArray(layoutEditorSurfaceDefinition.layout)
                                      ? (layoutEditorSurfaceDefinition.layout as Array<Record<string, unknown>>)
                                      : [];
                                    const block = layoutBlocks.find((b) => String(b.slot_id || "") === slotId);
                                    const slotRec = slot as unknown as Record<string, unknown>;
                                    const mid =
                                      resolveSurfaceSlotMode(slotRec) ||
                                      resolveSurfaceSlotMode(block || undefined);
                                    const wname = mid
                                      ? modeMeta[mid]?.name || customModeMeta[mid]?.name || mid
                                      : tr("分配模式", "Assign mode", "Dodijeli mod");
                                    const memoHint =
                                      mid === "MEMO" &&
                                      block &&
                                      typeof block.memo_text === "string" &&
                                      block.memo_text.trim()
                                        ? block.memo_text.trim().slice(0, 48) + (block.memo_text.length > 48 ? "…" : "")
                                        : "";
                                    const tipLine = memoHint || modeMeta[mid]?.tip || customModeMeta[mid]?.tip || "";
                                    const st = String(slot.slot_type || "").toUpperCase() || "—";
                                    return (
                                      <button
                                        key={slotId || `g-${String(slot.x)}-${String(slot.y)}`}
                                        type="button"
                                        onClick={() =>
                                          openSurfaceSlotModal(surfaceLayoutEditorId, {
                                            type: "grid",
                                            slotId: slotId || `slot-${String(slot.x)}-${String(slot.y)}`,
                                          })
                                        }
                                        style={{
                                          gridColumn: `${Number(slot.x ?? 0) + 1} / span ${Number(slot.w ?? 1)}`,
                                          gridRow: `${Number(slot.y ?? 0) + 1} / span ${Number(slot.h ?? 1)}`,
                                        }}
                                        className="min-h-[48px] min-w-0 rounded-2xl border border-ink/9 bg-white/95 px-3 py-2.5 text-left text-sm text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_10px_-3px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.95)] transition-[box-shadow,border-color,transform] duration-200 ease-out hover:border-ink/16 hover:shadow-[0_4px_14px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-px active:translate-y-0"
                                      >
                                        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-light mb-0.5">
                                          {st}
                                          {slotId ? ` · ${slotId}` : ""}
                                        </div>
                                        <div className="text-[11px] font-semibold text-ink mb-0.5 line-clamp-1">{wname}</div>
                                        <div className="font-medium text-ink wrap-break-word text-[13px] leading-snug line-clamp-3">
                                          {tipLine.trim() || tr("点击配置", "Tap to configure", "Klikni za postavke")}
                                        </div>
                                      </button>
                                    );
                                  })
                                : (["top", "middle", "bottom"] as const).map((slot) => {
                                    const item = surfaceEditorSlotItems[slot];
                                    const mid = resolveSurfaceSlotMode(item);
                                    const wname = mid
                                      ? modeMeta[mid]?.name || customModeMeta[mid]?.name || mid
                                      : tr("分配模式", "Assign mode", "Dodijeli mod");
                                    const memoHint =
                                      mid === "MEMO" && item && typeof item.memo_text === "string" && item.memo_text.trim()
                                        ? item.memo_text.trim().slice(0, 48) + (item.memo_text.length > 48 ? "…" : "")
                                        : "";
                                    const tipLine = memoHint || modeMeta[mid]?.tip || customModeMeta[mid]?.tip || "";
                                    const area = surfaceSlotGridArea(surfaceLayoutEditorId, slot);
                                    return (
                                      <button
                                        key={slot}
                                        type="button"
                                        onClick={() =>
                                          openSurfaceSlotModal(surfaceLayoutEditorId, { type: "legacy", position: slot })
                                        }
                                        style={area ? { gridArea: area } : undefined}
                                        className="min-h-[48px] rounded-2xl border border-ink/9 bg-white/95 px-3 py-2.5 text-left text-sm text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_10px_-3px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.95)] transition-[box-shadow,border-color,transform] duration-200 ease-out hover:border-ink/16 hover:shadow-[0_4px_14px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-px active:translate-y-0"
                                      >
                                        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-light mb-0.5">
                                          {wname}
                                        </div>
                                        <div className="font-medium text-ink wrap-break-word text-[13px] leading-snug line-clamp-3">
                                          {tipLine.trim() || tr("点击配置", "Tap to configure", "Klikni za postavke")}
                                        </div>
                                      </button>
                                    );
                                  })}
                            </div>
                          </div>

                          <p className="text-xs text-ink-light">
                            {tr(
                              "预览由后端生成 PNG（/api/preview/surface）。配置满意后在右侧点「重新生成预览」。",
                              "Preview is a server PNG (/api/preview/surface). When the layout looks right, click “Regenerate Preview” on the right.",
                              "Pregled je PNG na poslužitelju (/api/preview/surface). Kad je raspored OK, klikni „Ponovno generiraj pregled” desno.",
                            )}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <p className="text-sm text-ink-light px-1">{tr("请先点击上方一个 Surface 以编辑布局。", "Click a surface above to edit its layout.", "Klikni surface gore za uređivanje rasporeda.")}</p>
                    )}

                    <Dialog open={surfaceSlotModal !== null} onClose={() => setSurfaceSlotModal(null)}>
                      <DialogContent className="max-w-2xl max-h-[min(90vh,720px)] overflow-y-auto">
                        <DialogHeader onClose={() => setSurfaceSlotModal(null)}>
                          <DialogTitle>
                            {surfaceSlotModal
                              ? surfaceSlotModal.kind === "grid"
                                ? tr(
                                    `槽位 · ${surfaceSlotModal.slotId}`,
                                    `Slot · ${surfaceSlotModal.slotId}`,
                                    `Slot · ${surfaceSlotModal.slotId}`,
                                  )
                                : surfaceSlotModal.position === "top"
                                  ? tr("槽位 · 上区", "Slot · Top", "Slot · Gore")
                                  : surfaceSlotModal.position === "middle"
                                    ? tr("槽位 · 中区", "Slot · Middle", "Slot · Sredina")
                                    : tr("槽位 · 下区", "Slot · Bottom", "Slot · Dolje")
                              : ""}
                          </DialogTitle>
                          <DialogDescription>
                            {tr(
                              "点选与「内容模式」相同的模式卡片；每个槽位会用该模式在对应尺寸下渲染。",
                              "Pick a mode card (same catalog as Content Modes); each slot renders that mode at the slot size.",
                              "Odaberi mod (isti katalog kao kod modova); svaki slot renderira taj mod u veličini slota.",
                            )}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[min(52vh,480px)] overflow-y-auto pr-1">
                            {surfaceSlotModeChoices.map((it) => {
                              const mid = it.mode_id.toUpperCase();
                              const selected = surfaceSlotModalMode === mid;
                              const name = modeMeta[mid]?.name || customModeMeta[mid]?.name || it.display_name || mid;
                              const tip = modeMeta[mid]?.tip || customModeMeta[mid]?.tip || it.description || "";
                              return (
                                <div
                                  key={mid}
                                  className="flex h-[118px] flex-col overflow-hidden rounded-xl border border-ink/10 bg-white shadow-[2px_2px_0_0_rgba(0,0,0,0.04)]"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setSurfaceSlotModalMode(mid)}
                                    className={`flex min-h-0 flex-1 flex-col justify-start overflow-hidden px-3 py-2 text-left transition-colors ${
                                      selected ? "bg-ink text-white" : "hover:bg-paper-dark text-ink"
                                    }`}
                                    title={tip}
                                  >
                                    <div className="text-sm font-semibold leading-tight line-clamp-2">{name}</div>
                                    <div
                                      className={`mt-0.5 line-clamp-3 text-[11px] leading-snug ${selected ? "text-white/85" : "text-ink-light"}`}
                                    >
                                      {tip}
                                    </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {surfaceSlotModalMode === "MEMO" ? (
                            <div className="space-y-1.5">
                              <label className="text-xs text-ink-light">{tr("备忘文本", "Memo text", "Memo tekst")}</label>
                              <textarea
                                value={surfaceSlotModalMemo}
                                onChange={(e) => setSurfaceSlotModalMemo(e.target.value)}
                                rows={3}
                                placeholder={tr("例如：今日重点", "e.g. Today’s focus", "npr. Fokus dana")}
                                className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white resize-y"
                              />
                            </div>
                          ) : null}
                          <div className="flex justify-end gap-2 pt-1 border-t border-ink/10">
                            <Button type="button" variant="outline" size="sm" onClick={() => setSurfaceSlotModal(null)}>
                              {tr("取消", "Cancel", "Odustani")}
                            </Button>
                            <Button type="button" size="sm" onClick={confirmSurfaceSlotModal}>
                              {tr("确定", "OK", "U redu")}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <SurfaceLayoutDialog
                      open={surfaceLayoutDialogOpen}
                      onClose={() => setSurfaceLayoutDialogOpen(false)}
                      surfaceId={surfaceLayoutEditorId || ""}
                      baseDefinition={layoutEditorSurfaceDefinition}
                      catalogItems={catalogItems}
                      tr={tr}
                      onApply={applySurfaceLayoutFromDialog}
                    />
                  </div>

                  <div ref={surfacePanelRef} className="min-w-0">
                    <p className="text-[11px] text-ink-light mb-2 leading-relaxed">
                      {surfacePlaybackMode === "single"
                        ? tr(
                            `默认 Surface：${assignedSurface || "—"}`,
                            `Default surface: ${assignedSurface || "—"}`,
                            `Zadani surface: ${assignedSurface || "—"}`,
                          )
                        : surfacePlaybackMode === "rotate"
                          ? tr(
                              `轮换预览（模拟当前）：${simulatedPreviewSurfaceId}`,
                              `Rotate preview (simulated now): ${simulatedPreviewSurfaceId}`,
                              `Rotacija (simulacija): ${simulatedPreviewSurfaceId}`,
                            )
                          : tr(
                              `日程预览（模拟当前）：${simulatedPreviewSurfaceId}`,
                              `Schedule preview (simulated now): ${simulatedPreviewSurfaceId}`,
                              `Raspored (simulacija): ${simulatedPreviewSurfaceId}`,
                            )}
                    </p>
                    <EInkPreviewPanel
                      tr={tr}
                      previewModeLabel={activeSurfaceDisplayName}
                      previewLoading={surfacePreviewLoading}
                      previewStatusText={surfacePreviewStatusText}
                      previewImg={surfacePreviewImg}
                      previewCacheHit={null}
                      previewLlmStatus={null}
                      canApplyToScreen={Boolean(mac && surfacePreviewImg && assignedSurface)}
                      applyToScreenLoading={surfaceApplyToScreenLoading}
                      onRegenerate={() => void fetchLiveSurfacePreview()}
                      onApplyToScreen={handleApplySurfaceToScreen}
                      emptyStateHint={tr(
                        "点选上方 Surface 并配置布局后，点此「重新生成预览」",
                        "Pick a surface above, set its layout, then click Regenerate Preview here.",
                        "Odaberi surface gore, postavi raspored, zatim ovdje „Ponovno generiraj pregled”.",
                      )}
                      rightActions={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSave}
                          disabled={!mac || saving}
                          className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
                        >
                          {saving ? <Loader2 size={14} className="animate-spin mr-1 inline" /> : null}
                          {tr("保存 Surface", "Save Surface", "Spremi surface")}
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === "preferences" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{tr("渲染模式", "Render Mode", "Način prikaza")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeviceRenderMode("mode")}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          deviceRenderMode === "mode" ? "bg-ink text-white border-ink" : "bg-white text-ink border-ink/20"
                        }`}
                      >
                        {tr("经典模式", "Mode (legacy)", "Legacy mod")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeviceRenderMode("surface")}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          deviceRenderMode === "surface" ? "bg-ink text-white border-ink" : "bg-white text-ink border-ink/20"
                        }`}
                      >
                        {tr("Surface 规则模式", "Surface (advanced)", "Surface (napredno)")}
                      </button>
                    </div>
                  </CardContent>
                </Card>
                  <RefreshStrategyEditor
                    tr={tr}
                    locale={locale}
                    location={currentLocation}
                    setLocation={applyGlobalLocation}
                    timezoneValue={currentLocation.timezone || ""}
                    setTimezoneValue={setGlobalTimezone}
                    modeLanguage={modeLanguage}
                    setModeLanguage={setModeLanguage}
                  modeLanguageOptions={MODE_LANGUAGE_OPTIONS}
                  contentTone={contentTone}
                  setContentTone={setContentTone}
                  characterTones={characterTones}
                  setCharacterTones={setCharacterTones}
                  customPersonaTone={customPersonaTone}
                  setCustomPersonaTone={setCustomPersonaTone}
                  handleAddCustomPersona={handleAddCustomPersona}
                  strategy={strategy}
                  setStrategy={setStrategy}
                  refreshMin={refreshMin}
                  setRefreshMin={setRefreshMin}
                  toneOptions={TONE_OPTIONS}
                  personaPresets={PERSONA_PRESETS.map((preset) => pickByLocale(locale, preset))}
                  strategies={Object.fromEntries(
                    Object.entries(STRATEGIES).map(([key, value]) => [key, pickByLocale(locale, value)]),
                  )}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{tr("设备活跃状态", "Device Active State", "Aktivno stanje uređaja")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <label className="flex items-start gap-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={alwaysActive}
                        onChange={(e) => setAlwaysActive(e.target.checked)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">{tr("始终保持活跃", "Keep device always active", "Uvijek drži uređaj aktivnim")}</div>
                        <div className="text-xs text-ink-light mt-1">
                          {tr(
                            "开启后，设备会持续保持活跃，不进入间歇状态或深度睡眠。",
                            "When enabled, the device stays active continuously and will not enter interval mode or deep sleep.",
                          )}
                        </div>
                      </div>
                    </label>
                  </CardContent>
                </Card>
                <Button
                  variant="outline"
                  onClick={handleSavePreferences}
                  disabled={!mac || savingPrefs}
                  className="w-full bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
                >
                  {savingPrefs ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                  {tr("保存", "Save", "Spremi")}
                </Button>
              </div>
            )}

            {/* API Keys Tab */}
            {activeTab === "api_keys" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {tr("API Keys 与额度", "API Keys & Quota", "API ključevi i kvota")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {apiKeysLoading ? (
                      <div className="flex items-center gap-2 text-sm text-ink-light">
                        <Loader2 size={14} className="animate-spin" />
                        {tr("加载中...", "Loading...", "Učitavanje...")}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-ink/10 bg-paper p-3 text-sm text-ink-light">
                      {tr(
                        "提示：保留免费额度机制；一旦你配置自己的 API Key，系统会优先使用你的 Key。",
                        "Note: free quota remains available; once you configure your own API key, your key is used with priority.",
                        "Napomena: besplatna kvota ostaje; kad postaviš vlastiti API ključ, koristi se prioritetno tvoj ključ.",
                      )}
                      <div className="mt-2 font-medium text-ink">
                        {tr("当前免费额度", "Current free quota", "Trenutna besplatna kvota")}:{" "}
                        {freeQuotaRemaining != null ? freeQuotaRemaining : "-"}
                      </div>
                      <div className="mt-1 text-xs text-ink-light">
                        {tr("上次更新", "Last updated", "Zadnje ažuriranje")}:{" "}
                        {apiKeysUpdatedAt
                          ? new Date(apiKeysUpdatedAt).toLocaleString(locale === "zh" ? "zh-CN" : locale === "hr" ? "hr-HR" : "en-US")
                          : "-"}
                      </div>
                    </div>

                    <Field label={tr("提供商模式", "Provider Mode", "Način pružatelja")}>
                      <div className="flex flex-wrap gap-3">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="llm-mode"
                            checked={llmAccessModeDraft === "preset"}
                            onChange={() => setLlmAccessModeDraft("preset")}
                          />
                          {tr("DeepSeek（平台）", "DeepSeek (Managed)", "DeepSeek (upravljano)")}
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="llm-mode"
                            checked={llmAccessModeDraft === "custom_openai"}
                            onChange={() => setLlmAccessModeDraft("custom_openai")}
                          />
                          {tr("OpenAI / 兼容", "OpenAI / Compatible", "OpenAI / kompatibilno")}
                        </label>
                      </div>
                    </Field>

                    <Field label={tr("模型名称", "Model Name", "Naziv modela")}>
                      {(() => {
                        const opts = [...modelsForConfigApiKeysTab(llmAccessModeDraft)];
                        const t = apiModelDraft.trim();
                        const orphan = t.length > 0 && !opts.includes(t);
                        const selectValue = orphan ? apiModelDraft : opts.includes(t) ? t : opts[0];
                        return (
                          <select
                            value={selectValue}
                            onChange={(e) => setApiModelDraft(e.target.value)}
                            className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                          >
                            {orphan ? <option value={apiModelDraft}>{apiModelDraft}</option> : null}
                            {opts.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </Field>

                    {llmAccessModeDraft === "custom_openai" && (
                      <Field label={tr("Base URL", "Base URL", "Base URL")}>
                        <input
                          value={apiBaseUrlDraft}
                          onChange={(e) => setApiBaseUrlDraft(e.target.value)}
                          placeholder="https://api.openai.com/v1"
                          className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                        />
                      </Field>
                    )}

                    <Field label={tr("API Key", "API Key", "API ključ")}>
                      <div className="relative">
                        <input
                          type={apiKeyVisible ? "text" : "password"}
                          value={apiKeyDraft}
                          onChange={(e) => setApiKeyDraft(e.target.value)}
                          placeholder={tr("输入你的 API Key", "Enter your API key", "Unesi svoj API ključ")}
                          className="w-full rounded-xl border border-ink/20 px-3 py-2 pr-10 text-sm bg-white font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setApiKeyVisible((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-light hover:text-ink"
                          aria-label={apiKeyVisible ? "Hide API key" : "Show API key"}
                        >
                          {apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={testUserApiKeys}
                        disabled={apiKeyTesting || apiKeysSaving || apiKeysRemoving}
                        className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white"
                      >
                        {apiKeyTesting ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
                        {tr("测试连接", "Test Connection", "Testiraj vezu")}
                      </Button>
                      <Button
                        onClick={saveUserApiKeys}
                        disabled={apiKeysSaving || apiKeysRemoving}
                        className="bg-ink text-white hover:bg-ink/90"
                      >
                        {apiKeysSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                        {tr("保存 API Keys", "Save API Keys", "Spremi API ključeve")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={removeUserApiKeys}
                        disabled={apiKeysSaving || apiKeysRemoving}
                        className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white"
                      >
                        {apiKeysRemoving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
                        {tr("移除并回退免费额度", "Remove and fallback to free quota", "Ukloni i vrati na besplatnu kvotu")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sharing Tab */}
            {activeTab === "sharing" && (
              <div className="space-y-4">
                {currentUserRole === "owner" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{tr("共享成员", "Sharing", "Dijeljenje")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2 flex-wrap">
                        <input
                          value={shareUsernameInput}
                          onChange={(e) => setShareUsernameInput(e.target.value)}
                          placeholder={tr("输入要共享的用户名", "Enter username to share", "Unesi korisničko ime za dijeljenje")}
                          className="flex-1 min-w-[220px] rounded-xl border border-ink/20 px-3 py-2 text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={handleShareDevice} disabled={!shareUsernameInput.trim()}>
                          {tr("分享", "Share", "Podijeli")}
                        </Button>
                      </div>
                      {membersLoading ? (
                        <div className="flex items-center gap-2 text-sm text-ink-light">
                          <Loader2 size={14} className="animate-spin" /> {tr("加载成员中...", "Loading members...", "Učitavam članove...")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {deviceMembers.map((member) => (
                            <div key={member.user_id} className="flex items-center justify-between rounded-xl border border-ink/10 p-2 text-sm">
                              <div>
                                <p className="font-medium text-ink">{member.username}</p>
                                <p className="text-xs text-ink-light">{member.role === "owner" ? "Owner" : "Member"}</p>
                              </div>
                              {member.role !== "owner" ? (
                                <Button variant="outline" size="sm" onClick={() => handleRemoveMember(member.user_id)}>
                                  {tr("移除", "Remove", "Ukloni")}
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="p-3 rounded-xl border border-ink/10 bg-paper text-sm text-ink-light">
                    {tr("只有设备 Owner 可以管理共享成员。", "Only the device owner can manage sharing.", "Samo vlasnik uređaja može upravljati dijeljenjem.")}
                  </div>
                )}

                {pendingRequests.some((item) => item.mac === mac) ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{tr("待处理绑定请求", "Pending requests", "Zahtjevi na čekanju")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {pendingRequests.filter((item) => item.mac === mac).map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink/10 p-2 text-sm">
                          <div>
                            <p className="font-medium text-ink">{item.requester_username}</p>
                            <p className="text-xs text-ink-light">{tr("请求绑定此设备", "Requested to bind this device", "Zatraženo je vezanje ovog uređaja")}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleRejectRequest(item.id)}>
                              {tr("拒绝", "Reject", "Odbij")}
                            </Button>
                            <Button size="sm" onClick={() => handleApproveRequest(item.id)}>
                              {tr("同意", "Approve", "Odobri")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}


            {/* Stats Tab */}
            {activeTab === "stats" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 size={18} /> {tr("设备状态", "Device Status", "Status uređaja")}
                    {mac && <Button variant="ghost" size="sm" onClick={loadStats}><RefreshCw size={12} /></Button>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!mac && <p className="text-sm text-ink-light">{tr("需要连接设备后才能查看状态", "Connect a device to view status", "Poveži uređaj za prikaz statusa")}</p>}
                  {mac && !stats && <p className="text-sm text-ink-light">{tr("暂无统计数据", "No stats yet", "Još nema statistike")}</p>}
                  {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <StatCard label={tr("总渲染次数", "Total Renders", "Ukupno rendera")} value={stats.total_renders ?? "-"} />
                      <StatCard label={tr("缓存命中率", "Cache Hit Rate", "Stopa cache pogodaka")} value={stats.cache_hit_rate != null ? `${Math.round(stats.cache_hit_rate)}%` : "-"} />
                      <StatCard label={tr("电量", "Battery", "Baterija")} value={batteryPct != null ? `${batteryPct}%` : "-"} />
                      <StatCard label={tr("电压", "Voltage", "Napon")} value={stats.last_battery_voltage ? `${stats.last_battery_voltage.toFixed(2)}V` : "-"} />
                      <StatCard label={tr("WiFi 信号", "WiFi RSSI", "WiFi RSSI")} value={stats.last_rssi ? `${stats.last_rssi} dBm` : "-"} />
                      <StatCard label={tr("错误次数", "Error Count", "Broj grešaka")} value={stats.error_count ?? "-"} />
                      {stats.last_refresh && <StatCard label={tr("上次刷新", "Last Refresh", "Zadnje osvježenje")} value={new Date(stats.last_refresh).toLocaleString(locale === "zh" ? "zh-CN" : locale === "hr" ? "hr-HR" : "en-US")} />}
                    </div>
                  )}
                  {stats?.mode_frequency && Object.keys(stats.mode_frequency).length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium mb-3">{tr("模式使用频率", "Mode Frequency", "Učestalost modova")}</h4>
                      <div className="space-y-2">
                        {Object.entries(stats.mode_frequency)
                          .sort(([, a], [, b]) => b - a)
                          .map(([mode, count]) => {
                            const max = Math.max(...Object.values(stats.mode_frequency!));
                            return (
                              <div key={mode} className="flex items-center gap-2 text-sm">
                                <span className="w-20 text-ink-light truncate">{modeMeta[mode]?.name || customModeMeta[mode]?.name || mode}</span>
                                <div className="flex-1 bg-paper-dark rounded-full h-4 overflow-hidden">
                                  <div className="bg-ink h-full rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                                </div>
                                <span className="w-8 text-right text-ink-light text-xs">{count}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {mac && currentUser && settingsMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/30" onClick={() => setSettingsMode(null)} />
              <Card className="relative z-10 w-full max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>
                      {tr("模式设置", "Mode Settings", "Postavke moda")}: {modeMeta[settingsMode]?.name || customModeMeta[settingsMode]?.name || settingsMode}
                    </span>
                    <button className="text-ink-light hover:text-ink" onClick={() => setSettingsMode(null)}>
                      <X size={16} />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label={tr("城市（可选）", "City (optional)", "Grad (opcionalno)")}>
                    <LocationPicker
                      value={extractLocationValue(getModeOverride(settingsMode) as Record<string, unknown>)}
                      onChange={(next) =>
                        updateModeOverride(settingsMode, {
                          city: next.city,
                          latitude: next.latitude,
                          longitude: next.longitude,
                          timezone: next.timezone,
                          admin1: next.admin1,
                          country: next.country,
                        })
                      }
                      locale={locale}
                      placeholder={tr("搜索模式专属地点", "Search a mode-specific place", "Pretraži lokaciju specifičnu za mod")}
                      helperText={tr(
                        `留空则使用全局默认：${describeLocation(currentLocation) || defaultCityName}`,
                        `Leave empty to use global default: ${describeLocation(currentLocation) || defaultCityName}`,
                        `Ostavi prazno za globalnu zadanu lokaciju: ${describeLocation(currentLocation) || "Zagreb"}`,
                      )}
                      className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                    />
                  </Field>
                  {activeModeSchema.map((item) => {
                    const key = `${settingsMode}:${item.key}`;
                    const override = getModeOverride(settingsMode);
                    const rawValue = override[item.key] ?? item.default;
                    const valueType = item.type || "text";
                    const options = (item.options || []).map((opt) => typeof opt === "string"
                      ? { value: opt, label: opt }
                      : { value: opt.value, label: opt.label });

                    if (settingsMode === "COUNTDOWN" && item.key === "countdownEvents") {
                      const events = Array.isArray(rawValue)
                        ? rawValue.map((ev) => ({
                            name: typeof ev?.name === "string" ? ev.name : "",
                            date: typeof ev?.date === "string" ? ev.date : "",
                            type: ev?.type === "countup" ? "countup" : "countdown",
                          }))
                        : [];
                      return (
                        <Field key={key} label={tr("倒计时事件", "Countdown Events", "Countdown Događaji")}>
                          {events.map((ev, i) => (
                            <div key={`${key}:${i}`} className="flex gap-2 mb-2">
                              <input
                                value={ev.name}
                                onChange={(e) => {
                                  const next = [...events];
                                  next[i] = { ...next[i], name: e.target.value };
                                  updateModeOverride(settingsMode, { [item.key]: next });
                                }}
                                placeholder={tr("事件名", "Event name", "Naziv događaja")}
                                className="flex-1 rounded-xl border border-ink/20 px-3 py-1.5 text-sm"
                              />
                              <input
                                type="date"
                                value={ev.date}
                                onChange={(e) => {
                                  const next = [...events];
                                  next[i] = { ...next[i], date: e.target.value };
                                  updateModeOverride(settingsMode, { [item.key]: next });
                                }}
                                className="rounded-xl border border-ink/20 px-3 py-1.5 text-sm"
                              />
                              <select
                                value={ev.type}
                                onChange={(e) => {
                                  const next = [...events];
                                  next[i] = { ...next[i], type: e.target.value === "countup" ? "countup" : "countdown" };
                                  updateModeOverride(settingsMode, { [item.key]: next });
                                }}
                                className="rounded-xl border border-ink/20 px-2 py-1.5 text-sm bg-white"
                              >
                                <option value="countdown">{tr("倒计时", "Countdown", "Odbrojavanje")}</option>
                                <option value="countup">{tr("正计时", "Count up", "Brojanje prema gore")}</option>
                              </select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const next = events.filter((_, j) => j !== i);
                                  updateModeOverride(settingsMode, { [item.key]: next });
                                }}
                              >
                                x
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const next = [...events, { name: "", date: "", type: "countdown" }];
                              updateModeOverride(settingsMode, { [item.key]: next });
                            }}
                          >
                            + {tr("添加事件", "Add event", "Dodaj događaj")}
                          </Button>
                        </Field>
                      );
                    }

                    if (item.as_json) {
                      const draft = settingsJsonDrafts[key] ?? (
                        rawValue === undefined ? "" : JSON.stringify(rawValue, null, 2)
                      );
                      return (
                        <Field key={key} label={item.label}>
                          <textarea
                            value={draft}
                            onChange={(e) => {
                              setSettingsJsonDrafts((prev) => ({ ...prev, [key]: e.target.value }));
                            }}
                            onBlur={() => {
                              const text = settingsJsonDrafts[key] ?? "";
                              if (!text.trim()) {
                                updateModeOverride(settingsMode, { [item.key]: undefined });
                                setSettingsJsonErrors((prev) => {
                                  const copied = { ...prev };
                                  delete copied[key];
                                  return copied;
                                });
                                return;
                              }
                              try {
                                const parsed = JSON.parse(text);
                                updateModeOverride(settingsMode, { [item.key]: parsed });
                                setSettingsJsonErrors((prev) => {
                                  const copied = { ...prev };
                                  delete copied[key];
                                  return copied;
                                });
                              } catch {
                                setSettingsJsonErrors((prev) => ({ ...prev, [key]: tr("JSON 格式错误", "Invalid JSON", "Neispravan JSON") }));
                              }
                            }}
                            rows={4}
                            placeholder={item.placeholder}
                            className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm font-mono"
                          />
                          {settingsJsonErrors[key] ? (
                            <p className="mt-1 text-xs text-red-600">{settingsJsonErrors[key]}</p>
                          ) : null}
                        </Field>
                      );
                    }

                    if (valueType === "textarea") {
                      return (
                        <Field key={key} label={item.label}>
                          <textarea
                            ref={settingsMode === "MEMO" && item.key === "memo_text" ? memoSettingsInputRef : undefined}
                            value={typeof rawValue === "string" ? rawValue : ""}
                            onChange={(e) => {
                              const next = e.target.value;
                              updateModeOverride(settingsMode, { [item.key]: next });
                              if (settingsMode === "MEMO" && item.key === "memo_text") {
                                setMemoText(next);
                              }
                            }}
                            rows={3}
                            placeholder={item.placeholder}
                            className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                          />
                        </Field>
                      );
                    }

                    if (valueType === "number") {
                      return (
                        <Field key={key} label={item.label}>
                          <input
                            type="number"
                            value={typeof rawValue === "number" ? rawValue : (item.default as number | undefined) ?? ""}
                            min={item.min}
                            max={item.max}
                            step={item.step}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                updateModeOverride(settingsMode, { [item.key]: undefined });
                                return;
                              }
                              updateModeOverride(settingsMode, { [item.key]: Number(v) });
                            }}
                            className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                          />
                        </Field>
                      );
                    }

                    if (valueType === "boolean") {
                      const checked = Boolean(rawValue);
                      return (
                        <Field key={key} label={item.label}>
                          <label className="inline-flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => updateModeOverride(settingsMode, { [item.key]: e.target.checked })}
                            />
                            {tr("启用", "Enabled", "Omogućeno")}
                          </label>
                        </Field>
                      );
                    }

                    if (valueType === "select" && options.length > 0) {
                      const current = typeof rawValue === "string" ? rawValue : options[0].value;
                      return (
                        <Field key={key} label={item.label}>
                          <select
                            value={current}
                            onChange={(e) => updateModeOverride(settingsMode, { [item.key]: e.target.value })}
                            className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                          >
                            {options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </Field>
                      );
                    }

                    return (
                      <Field key={key} label={item.label}>
                        <input
                          value={typeof rawValue === "string" ? rawValue : ""}
                          onChange={(e) => updateModeOverride(settingsMode, { [item.key]: e.target.value })}
                          placeholder={item.placeholder}
                          className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                        />
                      </Field>
                    );
                  })}
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => clearModeOverride(settingsMode)}>
                      {tr("恢复默认", "Reset to default", "Vrati zadano")}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handlePreviewFromSettings(false)}>
                        {tr("预览", "Preview", "Pregled")}
                      </Button>
                      <Button
                        variant={settingsMode && selectedModes.has(settingsMode) ? "default" : "outline"}
                        size="sm"
                        className={
                          settingsMode && selectedModes.has(settingsMode)
                            ? "bg-ink text-white border-ink hover:bg-ink hover:text-white"
                            : "bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white"
                        }
                        onClick={() => handlePreviewFromSettings(true)}
                      >
                        {tr("预览并加入轮播", "Preview and add to rotation", "Pregledaj i dodaj u rotaciju")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          </div>
        </div>
      )}

      <Dialog
        open={showFocusTokenModal}
        onClose={() => {
          setShowFocusTokenModal(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader
            onClose={() => {
              setShowFocusTokenModal(false);
            }}
          >
            <div>
              <DialogTitle>{tr("设备告警 Token 已生成", "Alert Token Generated", "Token za upozorenja je generiran")}</DialogTitle>
              <DialogDescription>
                {tr(
                  "将下面的 Token 配置到你的 OpenCLAW（或自建 Agent）里，用于向该设备发送紧急告警。",
                  "Copy this token into your OpenCLAW (or custom agent) to send urgent alerts to this device.",
                  "Kopiraj ovaj token u svoj OpenCLAW (ili vlastiti agent) za slanje hitnih upozorenja na uređaj.",
                )}
              </DialogDescription>
              <div className="mt-2 text-[11px] text-ink-light">
                {tr(
                  "提示：开启专注监听后，设备端通常需要重启/重新进入启动流程，才会开始 10 秒轮询告警并在屏幕显示内容。",
                  "Tip: after enabling Focus Listening, the device usually needs a restart / re-enter startup flow before it starts 10s alert polling and displaying messages.",
                  "Savjet: nakon uključivanja Focus Listeninga uređaj obično treba restart ili ponovni ulazak u startup kako bi krenuo s 10-sekundnim pollingom upozorenja.",
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-ink/20 bg-white px-3 py-2 text-xs font-mono break-all">
              {focusAlertToken || tr("（空）", "(empty)", "(prazno)")}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(focusAlertToken);
                    showToast(tr("已复制 Token", "Token copied", "Token je kopiran"), "success");
                  } catch {
                    showToast(tr("复制失败，请手动选中复制", "Copy failed, please copy manually", "Kopiranje nije uspjelo, kopiraj ručno"), "error");
                  }
                }}
                disabled={!focusAlertToken}
              >
                {tr("复制 Token", "Copy Token", "Kopiraj token")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowFocusTokenModal(false);
                }}
              >
                {tr("关闭", "Close", "Zatvori")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile save button */}
      {mac && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-ink/10">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={!mac || saving}
            className="w-full bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
          >
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
            {activeTab === "surfaces"
              ? tr("保存 Surface", "Save Surface", "Spremi surface")
              : tr("保存到设备", "Save to Device", "Spremi na uređaj")}
          </Button>
        </div>
      )}

      {previewConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{tr("确认预览", "Confirm Preview", "Potvrdi pregled")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-ink">
                {formatPreviewConfirmText(previewConfirm.usageSource)}
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreviewConfirm(null);
                  }}
                >
                  {tr("取消", "Cancel", "Odustani")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const pending = previewConfirm;
                    setPreviewConfirm(null);
                    if (pending) {
                      handlePreview(pending.mode, pending.forceNoCache, pending.forcedModeOverride, true);
                    }
                  }}
                  className="bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white"
                >
                  {tr("确定", "Confirm", "Potvrdi")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Invitation-code dialog */}
      {showInviteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>
                {currentUserRole === "member"
                  ? tr("免费额度已用完", "Free Quota Exhausted", "Besplatna kvota je potrošena")
                  : tr("请输入邀请码", "Enter Invitation Code", "Unesi kod pozivnice")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className={`${currentUserRole === "member" ? "text-base leading-7 text-ink" : "text-sm text-ink-light"}`}>
                {currentUserRole === "member"
                  ? tr(
                      `当前设备 owner${ownerUsername ? `（${ownerUsername}）` : ""} 的免费额度已用完，请联系 owner，或继续在线体验。`,
                      `This device owner's free quota is exhausted. Please contact ${ownerUsername || "the owner"}, or continue with device-free preview.`,
                      `Besplatna kvota vlasnika uređaja je potrošena. Obrati se ${ownerUsername || "vlasniku"} ili nastavi s pregledom bez uređaja.`,
                    )
                  : tr(
                      "您的免费额度已用完。您可以输入邀请码获得50次免费LLM调用额度，也可以在个人信息中设置自己的 API key。",
                      "Your free quota has been exhausted. You can enter an invitation code or configure your own API key in your profile.",
                      "Besplatna kvota je potrošena. Unesi kod pozivnice ili postavi vlastiti API ključ u profilu.",
                    )}
              </p>
              {currentUserRole === "member" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs leading-5 text-amber-800">
                    {tr(
                      "Member 免费额度仅用于无设备预览，不用于设备端生成。",
                      "Member free quota only applies to device-free preview, not on-device generation.",
                      "Member kvota vrijedi samo za pregled bez uređaja, ne i za generiranje na uređaju.",
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-xl border border-ink/20 bg-paper-dark">
                    <p className="text-xs text-ink-light mb-2">
                      {tr(
                        "提示：如果您有自己的 API key，可以在个人信息中配置，这样就不会受到额度限制了。",
                        "Tip: If you have your own API key, you can configure it in your profile to avoid quota limits.",
                        "Savjet: ako imaš vlastiti API ključ, možeš ga postaviti u profilu i izbjeći ograničenja kvote.",
                      )}
                    </p>
                    <Link href={withLocalePath(locale, "/profile")}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowInviteModal(false);
                        }}
                        className="w-full text-xs"
                      >
                        {tr("前往个人信息配置", "Go to Profile Settings", "Idi na postavke profila")}
                      </Button>
                    </Link>
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
                </>
              )}
              <div className={`flex gap-2 ${currentUserRole === "member" ? "flex-col-reverse sm:flex-row sm:justify-end" : "justify-end"}`}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteCode("");
                    setPendingPreviewMode(null);
                  }}
                  disabled={currentUserRole === "member" ? false : redeemingInvite}
                >
                  {tr("取消", "Cancel", "Odustani")}
                </Button>
                {currentUserRole === "member" && (
                  <Link href={withLocalePath(locale, "/preview")} className="sm:min-w-[180px]">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowInviteModal(false);
                        setInviteCode("");
                        setPendingPreviewMode(null);
                      }}
                      className="w-full bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
                    >
                      {tr("继续在线体验", "Continue Online Preview", "Nastavi online pregled")}
                    </Button>
                  </Link>
                )}
                {currentUserRole !== "member" && (
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
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Parameter dialog aligned with /preview. It opens for both preview and add-to-rotation actions. */}
      {paramModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setParamModal(null)} />
          <div className="relative w-[min(520px,calc(100vw-32px))] rounded-xl border border-ink/15 bg-white shadow-xl">
            <div className="px-4 py-3 border-b border-ink/10 flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">
                {paramModal.type === "quote"
                  ? tr("自定义语录", "Custom Quote", "Prilagođeni citat")
                  : paramModal.type === "weather"
                  ? tr("天气设置", "Weather Settings", "Postavke vremena")
                  : paramModal.type === "memo"
                  ? tr("便签内容", "Memo Content", "Sadržaj bilješke")
                  : paramModal.type === "countdown"
                  ? tr("倒计时设置", "Countdown Settings", "Postavke odbrojavanja")
                  : paramModal.type === "habit"
                  ? tr("习惯打卡", "Habit Tracker", "Praćenje navika")
                  : paramModal.type === "calendar"
                  ? tr("日历提醒", "Calendar Reminders", "Kalendarski podsjetnici")
                  : paramModal.type === "timetable"
                  ? tr("课程表设置", "Timetable Settings", "Postavke rasporeda")
                  : paramModal.type === "bf6"
                  ? tr("BF6 档案设置", "BF6 Profile Settings", "BF6 postavke profila")
                  : tr("人生进度条", "Life Progress", "Životni napredak")}
              </div>
              <button className="text-ink-light hover:text-ink" onClick={() => setParamModal(null)}>
                ✕
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              {paramModal.type === "quote" ? (
                <>
                  <div className="text-xs text-ink-light">
                    {tr(
                      "随机生成一条有深度的语录，或粘贴你自己的文字。",
                      "Generate a deep quote randomly, or paste your own text.",
                    )}
                  </div>
                  <textarea
                    value={quoteDraft}
                    onChange={(e) => setQuoteDraft(e.target.value)}
                    placeholder={tr("输入语录内容...", "Type your quote...", "Upiši svoj citat...")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm min-h-28 bg-white"
                  />
                  <input
                    value={authorDraft}
                    onChange={(e) => setAuthorDraft(e.target.value)}
                    placeholder={tr("作者（可选）", "Author (optional)", "Autor (opcionalno)")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        commitModalAction(paramModal.mode, paramModal.action);
                      }}
                      disabled={previewLoading}
                    >
                      {tr("随机生成", "Random generate", "Nasumično generiraj")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const q = quoteDraft.trim();
                        const a = authorDraft.trim();
                        commitModalAction(
                          paramModal.mode,
                          paramModal.action,
                          q ? ({ quote: q, author: a } as ModeOverride) : undefined,
                        );
                      }}
                      disabled={previewLoading}
                    >
                      {tr("使用我的输入", "Use my input", "Koristi moj unos")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "weather" ? (
                <>
                  <div className="text-xs text-ink-light">
                    {tr(
                      "搜索并选择具体地点查看天气，避免重名城市误匹配。",
                      "Search and choose a specific place to avoid ambiguous city names.",
                    )}
                  </div>
                  <LocationPicker
                    value={weatherDraftLocation}
                    onChange={setWeatherDraftLocation}
                    locale={locale}
                    placeholder={tr("输入地点名称（如：上海、巴黎、Singapore）", "Enter a place name (e.g. Shanghai, Paris, Singapore)", "Upiši naziv mjesta (npr. Zagreb, Pariz, Singapore)")}
                    helperText={tr("建议从候选列表中点选具体地点。", "Pick a precise result from the suggestion list.", "Odaberi precizan rezultat s liste prijedloga.")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                    autoFocus
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setWeatherDraftLocation(defaultWeatherLocation)}
                      disabled={previewLoading}
                    >
                      {tr("使用默认城市", "Use default city", "Koristi zadani grad")}
                    </Button>
                    <Button
                      onClick={() => {
                        const nextLocation = cleanLocationValue(weatherDraftLocation);
                        commitModalAction(
                          paramModal.mode,
                          paramModal.action,
                          nextLocation.city ? (nextLocation as ModeOverride) : undefined,
                        );
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览天气", "Preview weather", "Pregledaj vrijeme")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "memo" ? (
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
                      onClick={() => {
                        const m = memoDraft.trim();
                        commitModalAction(
                          paramModal.mode,
                          paramModal.action,
                          m ? ({ memo_text: m } as ModeOverride) : undefined,
                        );
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览便签", "Preview memo", "Pregledaj bilješku")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "countdown" ? (
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
                      onClick={() => commitModalAction(paramModal.mode, paramModal.action, undefined, true)}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={() => {
                        const today = new Date();
                        const target = new Date(countdownDate);
                        const days = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        commitModalAction(paramModal.mode, paramModal.action, {
                          events: [
                            {
                              name: countdownName || tr("倒计时", "Countdown", "Odbrojavanje"),
                              date: countdownDate,
                              type: "countdown",
                              days,
                            },
                          ],
                        } as ModeOverride);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览倒计时", "Preview Countdown", "Pregledaj odbrojavanje")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "habit" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr(
                      "管理你的习惯列表，勾选今日已完成的习惯。用 ✕ 移除不想追踪的习惯。",
                      "Manage your habit list. Check off completed habits today. Use ✕ to remove habits you don't want to track.",
                    )}
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {habitItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={(e) => {
                            const next = [...habitItems];
                            next[idx] = { ...next[idx], done: e.target.checked };
                            setHabitItems(next);
                          }}
                          className="w-4 h-4"
                        />
                        <input
                          value={item.name}
                          onChange={(e) => {
                            const next = [...habitItems];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setHabitItems(next);
                          }}
                          className="flex-1 rounded-xl border border-ink/20 px-3 py-1.5 text-sm bg-white"
                        />
                        <button
                          onClick={() => setHabitItems(habitItems.filter((_, i) => i !== idx))}
                          className="text-ink-light hover:text-red-500 px-2"
                          title={tr("移除此习惯", "Remove this habit", "Ukloni ovu naviku")}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setHabitItems([...habitItems, { name: "", done: false }])}
                    className="w-full mt-2 px-3 py-2 rounded-xl border border-dashed border-ink/20 text-sm text-ink-light hover:text-ink hover:border-ink/40 transition-colors"
                  >
                    + {tr("添加习惯", "Add Habit", "Dodaj naviku")}
                  </button>
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={() => commitModalAction(paramModal.mode, paramModal.action, undefined, true)}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={() => {
                        const tracked = habitItems.filter((h) => h.name.trim());
                        commitModalAction(paramModal.mode, paramModal.action, {
                          habitItems: tracked.map((h) => ({ name: h.name.trim(), done: h.done })),
                        } as ModeOverride);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览打卡", "Preview Habits", "Pregledaj navike")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "lifebar" ? (
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
                      onClick={() => commitModalAction(paramModal.mode, paramModal.action, undefined, true)}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={() => {
                        const lifePct = ((userAge / lifeExpectancy) * 100).toFixed(1);
                        commitModalAction(paramModal.mode, paramModal.action, {
                          age: userAge,
                          life_expect: lifeExpectancy,
                          life_pct: parseFloat(lifePct),
                          life_label: tr("人生", "Life", "Život"),
                        } as ModeOverride);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览进度", "Preview Progress", "Pregledaj napredak")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "calendar" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr(
                      "为日历中的特定日期添加提醒事项，提醒会显示在日期下方。",
                      "Add reminders for specific dates. They appear below each date in the calendar.",
                    )}
                  </div>
                  <CalendarReminders
                    reminders={
                      (getModeOverride("CALENDAR") as Record<string, unknown>)?.reminders as Record<string, string> ?? {}
                    }
                    onChange={(r) => {
                      updateModeOverride("CALENDAR", {
                        reminders: Object.keys(r).length > 0 ? r : undefined,
                      } as Record<string, unknown>);
                    }}
                    tr={tr}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={() => commitModalAction(paramModal.mode, paramModal.action, undefined, true)}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("跳过预览", "Skip Preview", "Preskoči pregled")}
                    </Button>
                    <Button
                      onClick={() => {
                        const reminders = (getModeOverride("CALENDAR") as Record<string, unknown>)?.reminders as Record<string, string> | undefined;
                        commitModalAction(paramModal.mode, paramModal.action,
                          reminders && Object.keys(reminders).length > 0
                            ? { reminders } as ModeOverride
                            : undefined,
                        );
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览日历", "Preview Calendar", "Pregledaj kalendar")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "timetable" ? (
                <>
                  <div className="text-xs text-ink-light mb-3">
                    {tr(
                      "选择课表类型并编辑课程安排，点击单元格即可修改。",
                      "Choose timetable type and edit courses. Click any cell to modify.",
                    )}
                  </div>
                  <TimetableEditor
                    data={timetableData}
                    onChange={setTimetableData}
                    tr={tr}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <Button
                      onClick={() => commitModalAction(paramModal.mode, paramModal.action, undefined, true)}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("使用默认", "Use Default", "Koristi zadano")}
                    </Button>
                    <Button
                      onClick={() => {
                        commitModalAction(paramModal.mode, paramModal.action, {
                          style: timetableData.style,
                          periods: timetableData.periods,
                          courses: timetableData.courses,
                        } as ModeOverride);
                      }}
                      disabled={previewLoading}
                      variant="outline"
                    >
                      {tr("预览课程表", "Preview Timetable", "Pregledaj raspored")}
                    </Button>
                  </div>
                </>
              ) : paramModal.type === "bf6" ? (
                <>
                  <div className="text-xs text-ink-light">
                    {tr(
                      "输入 Battlefield 6 用户名并选择平台，用于抓取档案统计。",
                      "Enter Battlefield 6 username and choose platform to fetch profile stats.",
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-ink mb-1.5">
                        {tr("BF6 用户名", "BF6 Username", "BF6 korisničko ime")}
                      </label>
                      <input
                        value={bf6UsernameDraft}
                        onChange={(e) => setBf6UsernameDraft(e.target.value)}
                        placeholder={tr("例如：shroud", "e.g. shroud", "npr. shroud")}
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm bg-white"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink mb-1.5">
                        {tr("平台", "Platform", "Platforma")}
                      </label>
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
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setBf6UsernameDraft("");
                        setBf6PlatformDraft("pc");
                      }}
                      disabled={previewLoading}
                    >
                      {tr("清空", "Clear", "Očisti")}
                    </Button>
                    <Button
                      onClick={() => {
                        const username = bf6UsernameDraft.trim();
                        commitModalAction(
                          paramModal.mode,
                          paramModal.action,
                          username
                            ? ({ bf6_username: username, bf6_platform: bf6PlatformDraft } as ModeOverride)
                            : undefined,
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

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-fade-in ${
          toast.type === "success" ? "bg-green-50 text-green-800 border border-green-200"
          : toast.type === "error" ? "bg-red-50 text-red-800 border border-red-200"
          : "bg-amber-50 text-amber-800 border border-amber-200"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function ConfigPage() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-ink-light">
          <Loader2 size={24} className="animate-spin mr-2" />
          {pickByLocale(locale, { zh: "加载中...", en: "Loading...", hr: "Učitavanje..." })}
        </div>
      }
    >
      <ConfigPageInner />
    </Suspense>
  );
}
