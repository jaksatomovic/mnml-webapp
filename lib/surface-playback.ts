export type SurfacePlaybackMode = "single" | "rotate" | "scheduled";

export type SurfacePlaylistEntry = {
  surface_id: string;
  enabled: boolean;
  duration_sec: number;
  order: number;
};

export type SurfaceScheduleBlock = {
  id: string;
  from: string;
  to: string;
  days: string[];
  type: "surface" | "playlist";
  surface_id?: string;
  playlist?: Array<{ surface_id: string; duration_sec: number }>;
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function weekdayCode(d: Date): (typeof WEEKDAYS)[number] {
  const i = d.getDay();
  const map: (typeof WEEKDAYS)[number][] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[i];
}

export function normalizePlaylistEntry(raw: Record<string, unknown>, index: number): SurfacePlaylistEntry {
  return {
    surface_id: String(raw.surface_id || raw.surface || "").trim(),
    enabled: raw.enabled !== false,
    duration_sec: Math.max(10, Number(raw.duration_sec) || 300),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
  };
}

export function normalizePlaylist(raw: unknown): SurfacePlaylistEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => (item && typeof item === "object" ? normalizePlaylistEntry(item as Record<string, unknown>, i) : null))
    .filter((x): x is SurfacePlaylistEntry => Boolean(x && x.surface_id));
}

function nestedPlaylistToEntries(
  nested: Array<{ surface_id: string; duration_sec: number }> | undefined,
): SurfacePlaylistEntry[] {
  if (!nested?.length) return [];
  return nested.map((p, order) => ({
    surface_id: String(p.surface_id || "").trim(),
    enabled: true,
    duration_sec: Math.max(10, Number(p.duration_sec) || 300),
    order,
  }));
}

/** Same rotation heuristic as backend: epoch seconds modulo total duration window. */
export function resolvePlaylistSurfaceId(
  playlist: SurfacePlaylistEntry[],
  now: Date,
  validIds: Set<string>,
): string | null {
  const enabled = [...playlist]
    .filter((p) => p.enabled && validIds.has(p.surface_id))
    .sort((a, b) => a.order - b.order);
  if (!enabled.length) return null;
  const durations = enabled.map((p) => Math.max(10, p.duration_sec));
  const total = durations.reduce((a, b) => a + b, 0);
  if (total <= 0) return enabled[0].surface_id;
  const sec = Math.floor(now.getTime() / 1000) % total;
  let acc = 0;
  for (let i = 0; i < enabled.length; i++) {
    const d = durations[i];
    if (sec < acc + d) return enabled[i].surface_id;
    acc += d;
  }
  return enabled[0].surface_id;
}

export function resolveScheduleSurfaceId(
  schedule: SurfaceScheduleBlock[],
  now: Date,
  assignedFallback: string,
): string | null {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const hhmm = `${hh}:${mm}`;
  const wd = weekdayCode(now);
  for (const block of schedule) {
    if (!block?.from || !block?.to) continue;
    const days = Array.isArray(block.days) ? block.days.map((d) => String(d).toLowerCase()) : [];
    if (days.length > 0 && !days.includes(wd)) continue;
    if (!(block.from <= hhmm && hhmm < block.to)) continue;
    const typ = block.type || "surface";
    if (typ === "playlist" && block.playlist?.length) {
      const pl = nestedPlaylistToEntries(block.playlist);
      const ids = new Set(pl.map((p) => p.surface_id).filter(Boolean));
      return resolvePlaylistSurfaceId(pl, now, ids) || assignedFallback || null;
    }
    const sid = String(block.surface_id || "").trim();
    if (sid) return sid;
  }
  return assignedFallback.trim() || null;
}

export function effectivePreviewSurfaceId(
  mode: SurfacePlaybackMode,
  assignedSurface: string,
  playlist: SurfacePlaylistEntry[],
  schedule: SurfaceScheduleBlock[],
  validIds: Set<string>,
  now: Date,
): string {
  const fallback = (assignedSurface || [...validIds][0] || "").trim();
  if (mode === "single") return fallback;
  if (mode === "rotate") {
    return resolvePlaylistSurfaceId(playlist, now, validIds) || fallback;
  }
  if (mode === "scheduled") {
    return resolveScheduleSurfaceId(schedule, now, fallback) || fallback;
  }
  return fallback;
}

export function validatePlaylist(playlist: SurfacePlaylistEntry[]): string | null {
  const enabled = playlist.filter((p) => p.enabled && p.surface_id.trim());
  if (!enabled.length) return "playlist_needs_enabled";
  for (const p of enabled) {
    if (p.duration_sec < 10) return "duration_min";
  }
  return null;
}

/** Returns null if OK, else first overlap description. */
export function validateScheduleNonOverlapping(schedule: SurfaceScheduleBlock[]): string | null {
  type Seg = { days: Set<string>; from: string; to: string; id: string };
  const segs: Seg[] = [];
  for (const b of schedule) {
    if (!b.from || !b.to || b.from >= b.to) return "invalid_range";
    const days = Array.isArray(b.days) && b.days.length > 0 ? b.days.map((d) => String(d).toLowerCase()) : [...WEEKDAYS];
    segs.push({ days: new Set(days), from: b.from, to: b.to, id: b.id || "" });
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      for (const da of a.days) {
        if (!b.days.has(da)) continue;
        if (a.from < b.to && b.from < a.to) return `overlap:${a.id}:${b.id}`;
      }
    }
  }
  return null;
}
