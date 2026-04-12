/**
 * Client-side validation for surface grid slots (mirrors backend/core/surface_grid.py).
 */

export type SurfaceGridSlot = Record<string, unknown> & {
  id?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  slot_type?: string;
  mode_id?: string;
  mode?: string;
};

/** Fixed visual spacing for all surfaces (matches DEFAULT_SURFACE_LIBRARY in config UI). */
export const SURFACE_GRID_GAP_PX = 6;
export const SURFACE_GRID_PADDING_PX = 8;

/** Layout builder: discrete grid limits (aligned with backend/core/surface_grid.py). */
export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 4;
export const MIN_GRID_ROWS = 2;
export const MAX_GRID_ROWS = 6;
export const MAX_SURFACE_SLOTS = 6;

export type GridSpec = {
  columns: number;
  rows: number;
  gap: number;
  padding: number;
};

/** Always use fixed gap/padding; only columns/rows vary. */
export function buildGridSpec(columns: number, rows: number): GridSpec {
  const c = Math.min(
    MAX_GRID_COLUMNS,
    Math.max(MIN_GRID_COLUMNS, Math.round(Number(columns) || MIN_GRID_COLUMNS)),
  );
  const r = Math.min(MAX_GRID_ROWS, Math.max(MIN_GRID_ROWS, Math.round(Number(rows) || MIN_GRID_ROWS)));
  return {
    columns: c,
    rows: r,
    gap: SURFACE_GRID_GAP_PX,
    padding: SURFACE_GRID_PADDING_PX,
  };
}

/** Normalize any grid object to fixed gap/padding (device / drafts may omit or override). */
export function normalizeSurfaceGridSpec(g: Partial<GridSpec> | undefined | null): GridSpec {
  return buildGridSpec(g?.columns ?? 2, g?.rows ?? 2);
}

const SLOT_TYPE_SPAN: Record<string, [number, number]> = {
  SMALL: [1, 1],
  WIDE: [2, 1],
  TALL: [1, 2],
  LARGE: [2, 2],
};

function asInt(v: unknown, defaultVal: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : defaultVal;
}

export function inferSlotTypeFromSpan(w: number, h: number): string {
  if (w === 1 && h === 1) return "SMALL";
  if (w === 2 && h === 1) return "WIDE";
  if (w === 1 && h === 2) return "TALL";
  if (w === 2 && h === 2) return "LARGE";
  return "CUSTOM";
}

/** Canonical ``slot_type`` for a rectangle, including ``FULL`` when it covers the entire grid. */
export function deriveExpectedSlotType(w: number, h: number, columns: number, rows: number): string {
  const base = inferSlotTypeFromSpan(w, h);
  if (base !== "CUSTOM") return base;
  if (w === columns && h === rows) return "FULL";
  return "CUSTOM";
}

export function slotTypeMatchesSpan(
  slotType: string,
  w: number,
  h: number,
  columns: number,
  rows: number,
): boolean {
  const st = (slotType || "").trim().toUpperCase();
  if (st === "FULL") return w === columns && h === rows;
  if (st === "CUSTOM") return w >= 1 && h >= 1 && w <= columns && h <= rows;
  const span = SLOT_TYPE_SPAN[st];
  if (!span) return false;
  return span[0] === w && span[1] === h;
}

export type LayoutValidationError = {
  code: string;
  message: string;
  slot_id?: string;
};

/** Mode picker / strict API: ``supported_slot_types`` must include the slot type literally. */
export function modeSupportsSlotTypeLiteral(
  supported: string[] | undefined | null,
  expectedSlotType: string,
): boolean {
  if (!supported || supported.length === 0) return true;
  const t = expectedSlotType.toUpperCase();
  return supported.some((s) => String(s).trim().toUpperCase() === t);
}

export type LayoutEditorCatalogItem = {
  mode_id: string;
  display_name?: string;
  supported_slot_types?: string[];
};

/**
 * Source-of-truth validation (mirrors backend ``validate_layout``).
 * Pass ``catalog`` to enforce mode existence and ``supported_slot_types`` (literal expected type).
 */
export function validateLayout(
  layout: { grid: GridSpec | Record<string, unknown>; slots: SurfaceGridSlot[] },
  catalog?: LayoutEditorCatalogItem[] | null,
): { valid: boolean; errors: LayoutValidationError[] } {
  const errors: LayoutValidationError[] = [];
  const err = (code: string, message: string, slotId?: string) => {
    const e: LayoutValidationError = { code, message };
    if (slotId) e.slot_id = slotId;
    errors.push(e);
  };

  const grid = layout.grid as Record<string, unknown>;
  const slots = layout.slots;
  if (!grid || typeof grid !== "object") {
    err("INVALID_LAYOUT", "layout.grid must be an object");
    return { valid: false, errors };
  }
  if (!Array.isArray(slots)) {
    err("INVALID_LAYOUT", "layout.slots must be an array");
    return { valid: false, errors };
  }

  const columns = asInt(grid.columns, 0);
  const rows = asInt(grid.rows, 0);
  if (
    columns < MIN_GRID_COLUMNS ||
    columns > MAX_GRID_COLUMNS ||
    rows < MIN_GRID_ROWS ||
    rows > MAX_GRID_ROWS
  ) {
    err(
      "GRID_INVALID",
      `grid columns must be ${MIN_GRID_COLUMNS}-${MAX_GRID_COLUMNS} and rows ${MIN_GRID_ROWS}-${MAX_GRID_ROWS}`,
    );
    return { valid: false, errors };
  }

  if (slots.length > MAX_SURFACE_SLOTS) {
    err("TOO_MANY_SLOTS", `at most ${MAX_SURFACE_SLOTS} slots allowed`);
    return { valid: false, errors };
  }

  const modeById = new Map<string, LayoutEditorCatalogItem>();
  if (catalog && catalog.length > 0) {
    for (const it of catalog) {
      modeById.set(String(it.mode_id).toUpperCase(), it);
    }
  }
  const useModes = Boolean(catalog && catalog.length > 0);

  const occOwner = new Map<string, string>();

  for (let i = 0; i < slots.length; i++) {
    const raw = slots[i];
    if (!raw || typeof raw !== "object") {
      err("INVALID_SLOT_DATA", `slots[${i}] must be an object`);
      continue;
    }
    const s = raw as SurfaceGridSlot;
    const idRaw = s.id;
    if (idRaw === undefined || idRaw === null || String(idRaw).trim() === "") {
      err("MISSING_SLOT_ID", "each slot must have a non-empty id");
      continue;
    }
    const sid = String(idRaw).trim();

    const req = ["x", "y", "w", "h"] as const;
    let coordBad = false;
    for (const k of req) {
      const v = s[k];
      if (v === undefined || v === null) {
        err("INVALID_SLOT_DATA", `slot ${sid}: ${k} is required`, sid);
        coordBad = true;
        break;
      }
      if (typeof v === "boolean" || (typeof v !== "number" && typeof v !== "string")) {
        err("INVALID_SLOT_DATA", `slot ${sid}: ${k} must be numeric`, sid);
        coordBad = true;
        break;
      }
    }
    if (coordBad) continue;

    const x = asInt(s.x, -1);
    const y = asInt(s.y, -1);
    const w = asInt(s.w, 0);
    const h = asInt(s.h, 0);
    const st = String(s.slot_type ?? "").trim().toUpperCase();

    if (x < 0 || y < 0 || w < 1 || h < 1) {
      err("INVALID_SLOT_DATA", `slot ${sid}: x,y must be ≥0 and w,h must be ≥1`, sid);
      continue;
    }
    if (w > columns || h > rows) {
      err("INVALID_SIZE", `slot ${sid}: span ${w}×${h} exceeds grid ${columns}×${rows}`, sid);
      continue;
    }
    if (x + w > columns || y + h > rows) {
      err("OUT_OF_BOUNDS", `slot ${sid} exceeds grid bounds`, sid);
      continue;
    }

    const expected = deriveExpectedSlotType(w, h, columns, rows);
    if (st !== expected) {
      err("INVALID_SLOT_TYPE", `slot ${sid}: slot_type must be ${expected} for span ${w}×${h} (got ${st || "missing"})`, sid);
      continue;
    }

    let overlapAt: [number, number] | null = null;
    let otherId: string | null = null;
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        const key = `${rx},${ry}`;
        if (occOwner.has(key)) {
          overlapAt = [rx, ry];
          otherId = occOwner.get(key) ?? null;
          break;
        }
      }
      if (overlapAt) break;
    }
    if (overlapAt && otherId) {
      err("SLOT_OVERLAP", `Slots ${otherId} and ${sid} overlap at cell (${overlapAt[0]},${overlapAt[1]})`, sid);
      continue;
    }

    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        occOwner.set(`${rx},${ry}`, sid);
      }
    }

    const mid = String(s.mode_id || s.mode || "").trim().toUpperCase();
    if (!mid || !useModes) continue;

    const entry = modeById.get(mid);
    if (!entry) {
      err("MODE_NOT_FOUND", `mode ${mid} is not in the available modes list`, sid);
      continue;
    }
    const sst = entry.supported_slot_types;
    if (sst && sst.length > 0 && !modeSupportsSlotTypeLiteral(sst, expected)) {
      err("MODE_NOT_SUPPORTED", `mode ${mid} does not support slot_type ${expected}`, sid);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** @deprecated Use ``validateLayout`` */
export function validateLayoutDocument(layout: Record<string, unknown> | null | undefined): {
  valid: boolean;
  errors: LayoutValidationError[];
} {
  if (!layout || typeof layout !== "object") {
    return { valid: false, errors: [{ code: "INVALID_LAYOUT", message: "layout must be an object" }] };
  }
  return validateLayout(layout as { grid: GridSpec; slots: SurfaceGridSlot[] }, null);
}

/**
 * Grid editor: geometry + optional catalog modes (same as ``validateLayout`` with catalog).
 */
export function validateSurfaceLayoutForUi(
  grid: GridSpec,
  slots: SurfaceGridSlot[],
  catalog?: LayoutEditorCatalogItem[] | null,
): { valid: boolean; errors: LayoutValidationError[] } {
  return validateLayout({ grid, slots }, catalog);
}

export function validateSurfaceSlots(
  slots: SurfaceGridSlot[],
  columns: number,
  rows: number,
): { ok: true } | { ok: false; error: string } {
  const cols = Math.max(1, columns);
  const rs = Math.max(1, rows);
  const occ: boolean[][] = Array.from({ length: rs }, () => Array(cols).fill(false));

  for (const raw of slots) {
    const x = asInt(raw.x, -1);
    const y = asInt(raw.y, -1);
    const w = asInt(raw.w, 0);
    const h = asInt(raw.h, 0);
    const st = String(raw.slot_type || "").trim().toUpperCase();
    const sid = String(raw.id || "?");

    if (x < 0 || y < 0 || w < 1 || h < 1) {
      return { ok: false, error: `Slot ${sid}: invalid x/y/w/h` };
    }
    if (x + w > cols || y + h > rs) {
      return { ok: false, error: `Slot ${sid}: out of grid bounds (${cols}×${rs})` };
    }
    const expected = deriveExpectedSlotType(w, h, cols, rs);
    if (st && st !== expected) {
      return { ok: false, error: `Slot ${sid}: slot_type must be ${expected} for span ${w}×${h}` };
    }
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (occ[ry][rx]) {
          return { ok: false, error: `Overlapping slots at cell (${rx},${ry})` };
        }
        occ[ry][rx] = true;
      }
    }
  }

  return { ok: true };
}

export function sortSurfaceSlotsReadingOrder(slots: SurfaceGridSlot[]): SurfaceGridSlot[] {
  return [...slots].sort((a, b) => {
    const ya = asInt(a.y, 0);
    const yb = asInt(b.y, 0);
    if (ya !== yb) return ya - yb;
    return asInt(a.x, 0) - asInt(b.x, 0);
  });
}

export function buildLayoutFromSlots(
  slots: SurfaceGridSlot[],
  previousLayout?: Array<Record<string, unknown>> | null,
): Array<Record<string, unknown>> {
  const memoBySlot = new Map<string, string>();
  if (previousLayout) {
    for (const b of previousLayout) {
      const sid = String(b.slot_id || "");
      if (sid && typeof b.memo_text === "string" && b.memo_text.trim()) {
        memoBySlot.set(sid, b.memo_text);
      }
    }
  }
  const ordered = sortSurfaceSlotsReadingOrder(slots);
  return ordered.map((s, i) => {
    const m = String(s.mode_id || s.mode || "STOIC").toUpperCase();
    const blk: Record<string, unknown> = { mode: m, position: `slot_${i}` };
    if (s.id) blk.slot_id = s.id;
    const sid = String(s.id || "");
    if (m === "MEMO" && sid && memoBySlot.has(sid)) {
      blk.memo_text = memoBySlot.get(sid);
    }
    return blk;
  });
}

export function defaultSpanForSlotType(slotType: string): [number, number] {
  const st = (slotType || "SMALL").trim().toUpperCase();
  if (st === "FULL") return [1, 1];
  if (st === "CUSTOM") return [1, 1];
  return SLOT_TYPE_SPAN[st] || [1, 1];
}

export function spanForSlotType(slotType: string, columns: number, rows: number): [number, number] {
  const st = (slotType || "SMALL").trim().toUpperCase();
  if (st === "FULL") {
    return [Math.max(1, columns), Math.max(1, rows)];
  }
  if (st === "CUSTOM") {
    return [1, 1];
  }
  return defaultSpanForSlotType(st);
}

/**
 * Find top-left (x,y) for a w×h rectangle that does not overlap existing slots.
 * Optionally try `prefer` first (e.g. user input).
 */
export function findValidPosition(
  slots: SurfaceGridSlot[],
  excludeIndex: number,
  columns: number,
  rows: number,
  w: number,
  h: number,
  prefer?: { x: number; y: number },
): { x: number; y: number } | null {
  const cols = Math.max(1, columns);
  const rs = Math.max(1, rows);
  if (w < 1 || h < 1 || w > cols || h > rs) return null;

  const tryPos = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x + w > cols || y + h > rs) return false;
    const testSlots = slots.map((s, i) => (i === excludeIndex ? { ...s, x, y, w, h } : { ...s }));
    return validateSurfaceSlots(testSlots, cols, rs).ok;
  };

  if (prefer && tryPos(Math.trunc(prefer.x), Math.trunc(prefer.y))) {
    return { x: Math.trunc(prefer.x), y: Math.trunc(prefer.y) };
  }
  for (let y = 0; y <= rs - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      if (tryPos(x, y)) return { x, y };
    }
  }
  return null;
}

export const SURFACE_SLOT_TYPES = ["SMALL", "WIDE", "TALL", "LARGE", "FULL", "CUSTOM"] as const;

const DEFAULT_SLOT_MODE = "STOIC";

/**
 * When editing layout only, carry over mode_id from existing surface slots by id; new slots get default.
 */
export function mergeSlotModesFromBase(
  slots: SurfaceGridSlot[],
  base: Record<string, unknown> | null | undefined,
): SurfaceGridSlot[] {
  const prev = Array.isArray(base?.slots) ? (base.slots as SurfaceGridSlot[]) : [];
  const modeById = new Map<string, string>();
  for (const s of prev) {
    const id = String(s.id ?? "").trim();
    if (id) modeById.set(id, String(s.mode_id || s.mode || DEFAULT_SLOT_MODE).toUpperCase());
  }
  return slots.map((s) => {
    const id = String(s.id ?? "").trim();
    const fromPrev = id ? modeById.get(id) : undefined;
    const mode_id = (fromPrev || String(s.mode_id || s.mode || DEFAULT_SLOT_MODE)).toUpperCase();
    return { ...s, mode_id };
  });
}

/**
 * Map a viewport point to a grid cell index (top-left of a slot), using the same padding/gap model as the CSS grid.
 */
export function clientPointToGridCell(
  clientX: number,
  clientY: number,
  gridRect: DOMRect,
  columns: number,
  rows: number,
  paddingPx: number,
  gapPx: number,
): { col: number; row: number } | null {
  const pad = paddingPx;
  const gap = gapPx;
  const cols = Math.max(1, columns);
  const rs = Math.max(1, rows);
  const innerW = gridRect.width - 2 * pad;
  const innerH = gridRect.height - 2 * pad;
  const lx = clientX - gridRect.left - pad;
  const ly = clientY - gridRect.top - pad;
  if (lx < 0 || ly < 0 || lx >= innerW || ly >= innerH) return null;
  const cw = (innerW - (cols - 1) * gap) / cols;
  const ch = (innerH - (rs - 1) * gap) / rs;
  let col = -1;
  for (let c = 0; c < cols; c++) {
    const start = c * (cw + gap);
    if (lx >= start && lx < start + cw) {
      col = c;
      break;
    }
  }
  let row = -1;
  for (let r = 0; r < rs; r++) {
    const start = r * (ch + gap);
    if (ly >= start && ly < start + ch) {
      row = r;
      break;
    }
  }
  if (col < 0 || row < 0) return null;
  return { col, row };
}
