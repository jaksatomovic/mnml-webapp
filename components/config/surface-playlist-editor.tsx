"use client";

import { useCallback } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import type { SurfacePlaylistEntry } from "@/lib/surface-playback";

export interface SurfacePlaylistEditorProps {
  playlist: SurfacePlaylistEntry[];
  onChange: (next: SurfacePlaylistEntry[]) => void;
  surfaceOptions: { id: string; name: string }[];
  tr: (zh: string, en: string, hr?: string) => string;
}

export function SurfacePlaylistEditor({ playlist, onChange, surfaceOptions, tr }: SurfacePlaylistEditorProps) {
  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= playlist.length || to >= playlist.length) return;
      const next = [...playlist];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next.map((p, order) => ({ ...p, order })));
    },
    [onChange, playlist],
  );

  const updateRow = useCallback(
    (index: number, patch: Partial<SurfacePlaylistEntry>) => {
      const next = playlist.map((p, i) => (i === index ? { ...p, ...patch } : p));
      onChange(next.map((p, order) => ({ ...p, order })));
    },
    [onChange, playlist],
  );

  const removeRow = useCallback(
    (index: number) => {
      const next = playlist.filter((_, i) => i !== index);
      onChange(next.map((p, order) => ({ ...p, order })));
    },
    [onChange, playlist],
  );

  const addSurface = useCallback(
    (surfaceId: string) => {
      const sid = surfaceId.trim();
      if (!sid) return;
      const next: SurfacePlaylistEntry[] = [
        ...playlist,
        { surface_id: sid, enabled: true, duration_sec: 300, order: playlist.length },
      ];
      onChange(next.map((p, order) => ({ ...p, order })));
    },
    [onChange, playlist],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className="text-[11px] text-ink-light block mb-1">
            {tr("加入 Surface", "Add surface", "Dodaj surface")}
          </label>
          <select
            className="w-full rounded-xl border border-ink/20 bg-white px-2 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (v) addSurface(v);
            }}
          >
            <option value="">{tr("选择…", "Choose…", "Odaberi…")}</option>
            {surfaceOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-ink-light">{tr("拖拽左侧手柄排序", "Drag the handle on each row to reorder.", "Povuci ručku za redoslijed.")}</p>

      <div className="space-y-2">
        {playlist.length === 0 ? (
          <p className="text-xs text-ink-light">{tr("播放列表为空", "Playlist is empty", "Playlista je prazna")}</p>
        ) : (
          playlist.map((row, index) => (
            <div
              key={`${row.surface_id}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white px-2 py-2"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isNaN(from)) return;
                reorder(from, index);
              }}
            >
              <div className="text-ink-light cursor-grab active:cursor-grabbing" title={tr("拖拽", "Drag", "Povuci")}>
                <GripVertical size={16} />
              </div>
              <span className="text-[11px] text-ink-light w-6">{index + 1}</span>
              <span className="text-sm font-medium min-w-[72px] flex-1">{surfaceOptions.find((s) => s.id === row.surface_id)?.name || row.surface_id}</span>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(index, { enabled: e.target.checked })}
                />
                {tr("启用", "On", "Uklj.")}
              </label>
              <label className="flex items-center gap-1 text-xs">
                <span className="text-ink-light">{tr("时长(s)", "Sec", "s")}</span>
                <input
                  type="number"
                  min={10}
                  step={10}
                  className="w-20 rounded-lg border border-ink/20 px-2 py-1 text-sm"
                  value={row.duration_sec}
                  onChange={(e) => updateRow(index, { duration_sec: Math.max(10, Number(e.target.value) || 10) })}
                />
              </label>
              <button
                type="button"
                className="ml-auto text-ink-light hover:text-red-600 p-1"
                title={tr("移除", "Remove", "Ukloni")}
                onClick={() => removeRow(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
