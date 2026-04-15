"use client";

import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, Field } from "@/components/config/shared";
import { LocationPicker } from "@/components/config/location-picker";
import type { LocationValue } from "@/lib/locations";

const TIMEZONE_OPTIONS = [
  "Europe/Zagreb",
  "Europe/Belgrade",
  "Europe/Ljubljana",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Budapest",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export function RefreshStrategyEditor({
  tr,
  locale,
  location,
  setLocation,
  timezoneValue,
  setTimezoneValue,
  modeLanguage,
  setModeLanguage,
  modeLanguageOptions,
  contentTone,
  setContentTone,
  characterTones,
  setCharacterTones,
  customPersonaTone,
  setCustomPersonaTone,
  handleAddCustomPersona,
  refreshMin,
  setRefreshMin,
  toneOptions,
  personaPresets,
}: {
  tr: (zh: string, en: string, hr?: string) => string;
  locale: "zh" | "en" | "hr";
  location: LocationValue;
  setLocation: (value: LocationValue) => void;
  timezoneValue: string;
  setTimezoneValue: (value: string) => void;
  modeLanguage: string;
  setModeLanguage: (value: string) => void;
  modeLanguageOptions: readonly { value: string; label: string; labelEn: string; labelHr?: string }[];
  contentTone: string;
  setContentTone: (value: string) => void;
  characterTones: string[];
  setCharacterTones: React.Dispatch<React.SetStateAction<string[]>>;
  customPersonaTone: string;
  setCustomPersonaTone: (value: string) => void;
  handleAddCustomPersona: () => void;
  refreshMin: number;
  setRefreshMin: (value: number) => void;
  toneOptions: readonly { value: string; label: string; labelEn?: string; labelHr?: string }[];
  personaPresets: readonly string[];
}) {
  const customPresets = characterTones.filter(
    (value) => !personaPresets.includes(value),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe size={18} /> {tr("个性化设置", "Preferences", "Postavke")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label={tr("城市（全局默认）", "City (global default)", "Grad (globalna zadana vrijednost)")}>
          <LocationPicker
            value={location}
            onChange={setLocation}
            locale={locale}
            placeholder={tr("如：深圳", "e.g. Shenzhen", "npr. Zagreb")}
            helperText={tr("搜索后请选择具体地点，例如：上海 · 中国、巴黎 · 法国、Singapore · Singapore。", "Search and choose a specific place, for example Shanghai · China, Paris · France, or Singapore · Singapore.", "Pretraži i odaberi točnu lokaciju, primjerice Zagreb · Hrvatska, Pariz · Francuska ili Singapore · Singapore.")}
            className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
          />
        </Field>
        <Field label={tr("时区", "Time zone", "Vremenska zona")}>
          <select
            value={timezoneValue}
            onChange={(e) => setTimezoneValue(e.target.value)}
            className="ink-native-select w-full"
          >
            <option value="">{tr("跟随地点自动填写", "Use location / auto", "Koristi lokaciju / automatski")}</option>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-ink-light">
            {tr(
              "若地点没有自动带出正确时区，可在这里手动指定。",
              "If the location does not provide the correct time zone, set it manually here.",
              "Ako lokacija ne vrati ispravnu vremensku zonu, ovdje je možeš ručno postaviti.",
            )}
          </p>
        </Field>
        <Field label={tr("语言", "Language", "Jezik")}>
          <div className="flex flex-wrap gap-2">
            {modeLanguageOptions.map((opt) => (
              <Chip
                key={opt.value}
                selected={modeLanguage === opt.value}
                onClick={() => setModeLanguage(opt.value)}
              >
                {locale === "zh" ? opt.label : locale === "hr" ? (opt.labelHr || opt.labelEn) : opt.labelEn}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={tr("内容语气", "Tone", "Ton sadržaja")}>
          <div className="flex flex-wrap gap-2">
            {toneOptions.map((opt) => (
              <Chip
                key={opt.value}
                selected={contentTone === opt.value}
                onClick={() => setContentTone(opt.value)}
              >
                {locale === "zh" ? opt.label : locale === "hr" ? (opt.labelHr || opt.labelEn || opt.label) : (opt.labelEn || opt.label)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={tr("人设风格", "Persona Style", "Stil persone")}>
          <div className="flex flex-wrap gap-2">
            {personaPresets.map((value) => (
              <Chip
                key={value}
                selected={characterTones.includes(value)}
                onClick={() =>
                  setCharacterTones((prev) =>
                    prev.includes(value)
                      ? prev.filter((item) => item !== value)
                      : [...prev, value],
                  )
                }
              >
                {value}
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={customPersonaTone}
              onChange={(e) => setCustomPersonaTone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomPersona();
                }
              }}
              placeholder={tr("自定义人设风格", "Custom persona style", "Prilagođeni stil persone")}
              className="flex-1 rounded-xl border border-ink/20 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAddCustomPersona}
              className="rounded-xl border border-ink/20 px-3 py-2 text-sm"
            >
              {tr("添加", "Add", "Dodaj")}
            </button>
          </div>
          {customPresets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {customPresets.map((value) => (
                <Chip
                  key={value}
                  selected
                  onClick={() =>
                    setCharacterTones((prev) => prev.filter((item) => item !== value))
                  }
                >
                  {value}
                </Chip>
              ))}
            </div>
          )}
        </Field>
        <Field label={tr("刷新间隔 (分钟)", "Refresh interval (minutes)", "Interval osvježavanja (minute)")}>
          <input
            type="number"
            min={10}
            max={1440}
            value={refreshMin}
            onChange={(e) => setRefreshMin(Number(e.target.value))}
            className="ink-native-number w-32 text-right tabular-nums"
          />
          <p className="mt-2 text-xs text-ink-light">
            {tr(
              "设备按此间隔拉取内容（10–1440 分钟）。Surface 播放节奏另在 Surfaces 中配置。",
              "Device fetch cadence in minutes (10–1440). Surface rotation timing is configured under Surfaces.",
              "Uređaj po ovom intervalu dohvaća sadržaj (10–1440 min). Rotaciju surfacea podešavaš u Surfaces.",
            )}
          </p>
        </Field>
      </CardContent>
    </Card>
  );
}
