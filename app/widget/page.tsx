"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { localeFromPathname, pickByLocale } from "@/lib/i18n";

function WidgetContent() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const searchParams = useSearchParams();
  const mac = searchParams.get("mac") || "";
  const mode = searchParams.get("mode") || "";
  const size = searchParams.get("size") || "medium";
  const error = mac ? "" : pickByLocale(locale, { zh: "缺少 mac 参数", en: "Missing mac parameter", hr: "Nedostaje mac parametar" });
  const imgSrc = (() => {
    if (!mac) return "";
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";
    const params = new URLSearchParams();
    if (mode) params.set("mode", mode);
    if (size) params.set("size", size);
    return `${apiBase}/api/widget/${encodeURIComponent(mac)}?${params.toString()}`;
  })();

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#fafaf7",
          color: "#888",
          fontFamily: "sans-serif",
          fontSize: "14px",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#fafaf7",
        padding: "8px",
      }}
    >
      {imgSrc ? (
        <Image
          src={imgSrc}
          alt={pickByLocale(locale, { zh: "NexInk 小组件", en: "NexInk Widget", hr: "NexInk widget" })}
          width={800}
          height={480}
          unoptimized
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            borderRadius: "8px",
          }}
        />
      ) : (
        <div style={{ color: "#888", fontFamily: "sans-serif" }}>
          {pickByLocale(locale, { zh: "加载中...", en: "Loading...", hr: "Učitavanje..." })}
        </div>
      )}
    </div>
  );
}

export default function WidgetPage() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            color: "#888",
          }}
        >
          {pickByLocale(locale, { zh: "加载中...", en: "Loading...", hr: "Učitavanje..." })}
        </div>
      }
    >
      <WidgetContent />
    </Suspense>
  );
}
