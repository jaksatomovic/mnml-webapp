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

function newBlock(): SurfaceScheduleBlock {
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

  const add = useCallback(() => {
    onChange([...schedule, newBlock()]);
  }, [onChange, schedule]);

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
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={add}>
          {tr("添加时段", "Add block", "Dodaj blok")}
        </Button>
      </div>
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
              <div className="flex flex-wrap gap-2">
                <label className="text-xs flex items-center gap-1">
                  {tr("从", "From", "Od")}
                  <input
                    type="time"
                    className="rounded-lg border border-ink/20 px-2 py-1 text-sm"
                    value={block.from}
                    onChange={(e) => patch(index, { from: e.target.value })}
                  />
                </label>
                <label className="text-xs flex items-center gap-1">
                  {tr("到", "To", "Do")}
                  <input
                    type="time"
                    className="rounded-lg border border-ink/20 px-2 py-1 text-sm"
                    value={block.to}
                    onChange={(e) => patch(index, { to: e.target.value })}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-1">
                {DAY_KEYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(index, d)}
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase border ${
                      block.days?.includes(d) ? "bg-ink text-white border-ink" : "bg-paper text-ink-light border-ink/15"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <label className="text-xs flex items-center gap-2">
                {tr("类型", "Type", "Tip")}
                <select
                  className="rounded-lg border border-ink/20 px-2 py-1 text-sm flex-1 min-w-[120px]"
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
                  className="w-full rounded-lg border border-ink/20 px-2 py-2 text-sm"
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
                        className="flex-1 min-w-[120px] rounded-lg border border-ink/20 px-2 py-1 text-sm"
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
                        className="w-24 rounded-lg border border-ink/20 px-2 py-1 text-sm"
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
