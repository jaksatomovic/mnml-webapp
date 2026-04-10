"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { localeFromPathname, pickByLocale } from "@/lib/i18n";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ConfigError({ error, reset }: ErrorProps) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  useEffect(() => {
    console.error("Config page error", error);
  }, [error]);

  const title = pickByLocale(locale, {
    en: "Config page is temporarily unavailable",
    hr: "Stranica postavki trenutačno nije dostupna",
    zh: "配置页暂时不可用",
  });
  const description = pickByLocale(locale, {
    en: "A config data error occurred while loading or rendering this page. You can retry the current route directly without losing the whole app shell.",
    hr: "Dogodila se greška pri učitavanju ili renderiranju konfiguracijskih podataka. Možeš ponovno pokušati bez rušenja cijelog sučelja.",
    zh: "配置数据加载或渲染时发生异常。可以直接重试当前路由，避免整站白屏。",
  });
  const retryLabel = pickByLocale(locale, {
    en: "Reload Config Page",
    hr: "Ponovno Učitaj Stranicu Postavki",
    zh: "重新加载配置页",
  });

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
        Config
      </p>
      <h2 className="text-3xl font-semibold text-neutral-900">{title}</h2>
      <p className="max-w-2xl text-sm leading-6 text-neutral-600">
        {description}
      </p>
      <div>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white"
        >
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
