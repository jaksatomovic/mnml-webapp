"use client";

import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SurfaceScheduleBlock } from "@/lib/surface-playback";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export interface SurfaceScheduleEditorProps {
  schedule: SurfaceScheduleBlock[];
  onChange: (next: SurfaceScheduleBlock[]) => void;
  surfaceOptions: { id: string; name: string }[];
  tr: (zh: string, en: string, hr?: string) => string;
}

/** Exported for the parent card header “Add block” action. */
export function createDefaultScheduleBlock(): SurfaceScheduleBlock {
  return {
    id: `block_${Date.now().toString(36)}`,
    from: "07:00",
    to: "09:00",
    days: ["mon", "tue", "wed", "thu", "fri"],
    type: "surface",
    surface_id: "",
  };
}

export function SurfaceScheduleEditor({ schedule, onChange, surfaceOptions, tr }: SurfaceScheduleEditorProps) {
  const patch = useCallback(
    (index: number, partial: Partial<SurfaceScheduleBlock>) => {
      const next = schedule.map((b, i) => (i === index ? { ...b, ...partial } : b));
      onChange(next);
    },
    [onChange, schedule],
  );

  const remove = useCallback(
    (index: number) => {
      onChange(schedule.filter((_, i) => i !== index));
    },
    [onChange, schedule],
  );

  const toggleDay = useCallback(
    (index: number, day: string) => {
      const b = schedule[index];
      if (!b) return;
      const set = new Set(b.days || []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      patch(index, { days: Array.from(set) });
    },
    [patch, schedule],
  );

  return (
    <div className="space-y-3">
      {schedule.length === 0 ? (
        <p className="text-xs text-ink-light">{tr("暂无日程规则", "No schedule blocks yet", "Nema rasporeda")}</p>
      ) : (
        <div className="space-y-3">
          {schedule.map((block, index) => (
            <div key={block.id} className="rounded-xl border border-ink/10 bg-white p-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <span className="text-xs font-medium text-ink-light">{tr("时段", "Block", "Blok")}</span>
                <button
                  type="button"
                  className="text-ink-light hover:text-red-600 p-1"
                  onClick={() => remove(index)}
                  title={tr("删除", "Delete", "Obriši")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
                {DAY_KEYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(index, d)}
                    className={`min-w-[2.25rem] shrink-0 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide border transition-colors ${
                      block.days?.includes(d) ? "bg-ink text-white border-ink" : "bg-paper text-ink-light border-ink/15 hover:border-ink/30"
                    }`}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs flex items-center gap-1">
                  {tr("从", "From", "Od")}
                  <input
                    type="time"
                    className="ink-native-text min-w-[7.25rem]"
                    value={block.from}
                    onChange={(e) => patch(index, { from: e.target.value })}
                  />
                </label>
                <label className="text-xs flex items-center gap-1">
                  {tr("到", "To", "Do")}
                  <input
                    type="time"
                    className="ink-native-text min-w-[7.25rem]"
                    value={block.to}
                    onChange={(e) => patch(index, { to: e.target.value })}
                  />
                </label>
              </div>
              <label className="text-xs flex items-center gap-2">
                {tr("类型", "Type", "Tip")}
                <select
                  className="ink-native-select flex-1 min-w-[140px]"
                  value={block.type}
                  onChange={(e) => {
                    const t = e.target.value as "surface" | "playlist";
                    if (t === "playlist") {
                      patch(index, {
                        type: "playlist",
                        playlist: block.playlist?.length
                          ? block.playlist
                          : [{ surface_id: surfaceOptions[0]?.id || "", duration_sec: 600 }],
                        surface_id: undefined,
                      });
                    } else {
                      patch(index, {
                        type: "surface",
                        surface_id: block.surface_id || surfaceOptions[0]?.id || "",
                        playlist: undefined,
                      });
                    }
                  }}
                >
                  <option value="surface">{tr("单个 Surface", "Single surface", "Jedan surface")}</option>
                  <option value="playlist">{tr("播放列表", "Playlist", "Playlista")}</option>
                </select>
              </label>
              {block.type === "surface" ? (
                <select
                  className="ink-native-select w-full"
                  value={block.surface_id || ""}
                  onChange={(e) => patch(index, { surface_id: e.target.value })}
                >
                  <option value="">{tr("选择 Surface", "Choose surface", "Odaberi surface")}</option>
                  {surfaceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  {(block.playlist || []).map((pl, pi) => (
                    <div key={pi} className="flex flex-wrap gap-2 items-center">
                      <select
                        className="ink-native-select flex-1 min-w-[140px]"
                        value={pl.surface_id}
                        onChange={(e) => {
                          const nextPl = [...(block.playlist || [])];
                          nextPl[pi] = { ...nextPl[pi], surface_id: e.target.value };
                          patch(index, { playlist: nextPl });
                        }}
                      >
                        {surfaceOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={10}
                        className="ink-native-number w-28 shrink-0 text-right tabular-nums"
                        value={pl.duration_sec}
                        onChange={(e) => {
                          const nextPl = [...(block.playlist || [])];
                          nextPl[pi] = { ...nextPl[pi], duration_sec: Math.max(10, Number(e.target.value) || 10) };
                          patch(index, { playlist: nextPl });
                        }}
                      />
                      <button
                        type="button"
                        className="text-ink-light hover:text-red-600"
                        onClick={() => {
                          const nextPl = (block.playlist || []).filter((_, i) => i !== pi);
                          patch(index, { playlist: nextPl });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      const nextPl = [
                        ...(block.playlist || []),
                        { surface_id: surfaceOptions[0]?.id || "", duration_sec: 600 },
                      ];
                      patch(index, { playlist: nextPl });
                    }}
                  >
                    {tr("添加一项", "Add row", "Dodaj red")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
