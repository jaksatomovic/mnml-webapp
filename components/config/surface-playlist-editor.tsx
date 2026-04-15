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

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-light">
        {tr(
          "在 Surface 库卡片上用 + / − 加入或移出轮换；拖拽左侧手柄排序。",
          "Use + / − on each surface card in the library to add or remove from rotation; drag the handle to reorder.",
          "Na kartici surfacea u biblioteci koristi + / − za rotaciju; povuci ručku za redoslijed.",
        )}
      </p>

      <div className="space-y-2">
        {playlist.length === 0 ? (
          <p className="text-xs text-ink-light">
            {tr(
              "播放列表为空。在上方 Surface 库卡片上点击 + 加入轮换。",
              "Playlist is empty. Tap + on a surface card in the library above to add it.",
              "Playlista je prazna. Klikni + na kartici surfacea u biblioteci gore.",
            )}
          </p>
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
                  className="ink-native-number w-24 shrink-0 text-right tabular-nums"
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
