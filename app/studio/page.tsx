"use client";

import { usePathname } from "next/navigation";
import { localeFromPathname, pickByLocale } from "@/lib/i18n";

export default function StudioPage() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const studioUrl = process.env.NEXT_PUBLIC_STUDIO_URL?.trim();

  const title = pickByLocale(locale, {
    zh: "Studio",
    en: "Studio",
    hr: "Studio",
  });

  const subtitle = pickByLocale(locale, {
    zh: "Studio 页面已创建，下一步可以在这里放置可视化编排、调试与发布工具。",
    en: "Studio page is ready. You can place visual composition, debugging, and publishing tools here next.",
    hr: "Studio stranica je spremna. Ovdje sljedeće možeš dodati alate za vizualno slaganje, debug i objavu.",
  });

  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-6xl items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-ink/10 bg-white/80 p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-light">{subtitle}</p>
        {studioUrl ? (
          <div className="mt-6">
            <a
              href={studioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-xl border border-ink/20 px-4 py-2 text-sm text-ink transition-colors hover:bg-ink/5"
            >
              Open Studio
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}
