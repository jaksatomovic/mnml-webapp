/** Collapsible groups for mode catalog (matches backend ``mode_catalog.CatalogItem.topic``). */
export const MODE_TOPIC_ORDER = [
  "core",
  "productivity",
  "fun",
  "learning",
  "life",
  "geek",
  "custom",
] as const;

export type ModeTopicId = (typeof MODE_TOPIC_ORDER)[number];

/**
 * Builtin mode_id → topic. Kept in sync with ``backend/core/mode_catalog.py`` so the config UI
 * groups widgets correctly even when ``/modes/catalog`` omits ``topic`` (older backends / proxies).
 */
export const BUILTIN_MODE_TOPIC_BY_ID: Record<string, ModeTopicId> = {
  DAILY: "core",
  WEATHER: "core",
  ZEN: "life",
  BRIEFING: "productivity",
  STOIC: "life",
  POETRY: "learning",
  ARTWALL: "geek",
  ALMANAC: "learning",
  RECIPE: "life",
  COUNTDOWN: "productivity",
  MEMO: "productivity",
  HABIT: "productivity",
  ROAST: "fun",
  FITNESS: "productivity",
  LETTER: "learning",
  THISDAY: "learning",
  RIDDLE: "fun",
  QUESTION: "learning",
  BIAS: "learning",
  STORY: "fun",
  LIFEBAR: "life",
  CHALLENGE: "productivity",
  WORD_OF_THE_DAY: "learning",
  MY_QUOTE: "life",
  CALENDAR: "productivity",
  TIMETABLE: "productivity",
  MY_ADAPTIVE: "custom",
};

function isKnownTopicId(t: string): t is ModeTopicId {
  return (MODE_TOPIC_ORDER as readonly string[]).includes(t);
}

/** Normalize a raw topic string from the API (if present). */
export function normalizeModeTopic(raw: string | undefined | null): ModeTopicId {
  const t = String(raw || "learning").toLowerCase().trim();
  if (isKnownTopicId(t)) return t;
  return "learning";
}

/**
 * Resolve collapsible group for a catalog row: prefer builtin map, then API ``topic``, then ``learning``.
 * Custom / user modes resolve to ``custom`` when ``source === "custom"``.
 */
export function resolveWidgetTopic(
  modeId: string,
  opts?: { source?: string; apiTopic?: string | null },
): ModeTopicId {
  const mid = (modeId || "").toUpperCase().trim();
  if (opts?.source === "custom") return "custom";
  if (mid === "MY_ADAPTIVE") return "custom";
  const builtin = BUILTIN_MODE_TOPIC_BY_ID[mid];
  if (builtin) return builtin;
  const fromApi = opts?.apiTopic;
  if (fromApi != null && String(fromApi).trim() !== "") {
    const t = String(fromApi).toLowerCase().trim();
    if (isKnownTopicId(t)) return t;
  }
  return "learning";
}

export function topicGroupLabel(
  topic: string,
  tr: (zh: string, en: string, hr?: string) => string,
): string {
  const t = topic.toLowerCase();
  const labels: Record<ModeTopicId, { zh: string; en: string; hr: string }> = {
    core: { zh: "核心", en: "Core", hr: "Jezgra" },
    productivity: { zh: "效率", en: "Productivity", hr: "Produktivnost" },
    fun: { zh: "趣味", en: "Fun", hr: "Zabava" },
    learning: { zh: "学习", en: "Learning", hr: "Učenje" },
    life: { zh: "生活", en: "Life", hr: "Život" },
    geek: { zh: "极客", en: "Geek", hr: "Geek" },
    custom: { zh: "自定义", en: "Custom", hr: "Prilagođeno" },
  };
  const L = labels[t as ModeTopicId];
  if (L) return tr(L.zh, L.en, L.hr);
  return tr(topic, topic, topic);
}
