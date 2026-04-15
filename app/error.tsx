"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { localeFromPathname, pickByLocale } from "@/lib/i18n";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorProps) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  useEffect(() => {
    console.error("Global route error", error);
  }, [error]);

  const title = pickByLocale(locale, {
    en: "Page failed to load",
    hr: "Stranica se nije uspjela učitati",
    zh: "页面加载失败",
  });
  const description = pickByLocale(locale, {
    en: "An unexpected error occurred. Try the current route again or refresh the page later.",
    hr: "Dogodila se neočekivana greška. Pokušaj ponovno otvoriti ovu rutu ili kasnije osvježi stranicu.",
    zh: "出现了未处理错误。可以重试当前路由，或稍后刷新页面。",
  });
  const retryLabel = pickByLocale(locale, {
    en: "Retry",
    hr: "Pokušaj Ponovno",
    zh: "重试",
  });

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            NexInk
          </p>
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="max-w-xl text-sm leading-6 text-neutral-600">
            {description}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white"
          >
            {retryLabel}
          </button>
        </main>
      </body>
    </html>
  );
}
