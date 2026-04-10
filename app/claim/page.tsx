"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { authHeaders, fetchCurrentUser } from "@/lib/auth";
import { localeFromPathname, pickByLocale, withLocalePath } from "@/lib/i18n";

function ClaimPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = localeFromPathname(typeof window === "undefined" ? "/" : window.location.pathname);
  const token = searchParams.get("token") || "";
  const pairCode = (searchParams.get("code") || "").trim().toUpperCase();
  const [status, setStatus] = useState<"loading" | "pending" | "error">("loading");
  const [message, setMessage] = useState("");
  const copy = useMemo(() => ({
    missingPair: pickByLocale(locale, {
      en: "Missing pairing information",
      hr: "Nedostaju podaci za uparivanje",
      zh: "缺少配对信息",
    }),
    claimFailed: pickByLocale(locale, {
      en: "Claim failed",
      hr: "Preuzimanje nije uspjelo",
      zh: "领取失败",
    }),
    waitingOwner: (owner?: string | null) => pickByLocale(locale, {
      en: owner ? `Claim request submitted. Waiting for ${owner} to approve.` : "Claim request submitted. Waiting for the owner to approve.",
      hr: owner ? `Zahtjev je poslan. Čeka se odobrenje korisnika ${owner}.` : "Zahtjev je poslan. Čeka se odobrenje vlasnika.",
      zh: owner ? `已提交绑定申请，等待 ${owner} 同意` : "已提交绑定申请，等待 owner 同意",
    }),
    title: pickByLocale(locale, {
      en: "Claim Device",
      hr: "Preuzmi Uređaj",
      zh: "设备领取",
    }),
    verifying: pickByLocale(locale, {
      en: "Verifying pairing information...",
      hr: "Provjeravam podatke za uparivanje...",
      zh: "正在验证配对信息...",
    }),
    backToDevices: pickByLocale(locale, {
      en: "Back to Devices",
      hr: "Natrag na Uređaje",
      zh: "返回设备列表",
    }),
  }), [locale]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token && !pairCode) {
        if (!cancelled) {
          setStatus("error");
          setMessage(copy.missingPair);
        }
        return;
      }
      try {
        const user = await fetchCurrentUser();
        if (!user) {
          const next = token
            ? `/claim?token=${encodeURIComponent(token)}`
            : `/claim?code=${encodeURIComponent(pairCode)}`;
          router.replace(`${withLocalePath(locale, "/login")}?next=${encodeURIComponent(next)}`);
          return;
        }
        const res = await fetch("/api/claim/consume", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(token ? { token } : { pair_code: pairCode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || copy.claimFailed);
        }
        if (data.status === "claimed" || data.status === "already_member") {
          router.replace(`${withLocalePath(locale, "/config")}?mac=${encodeURIComponent(data.mac)}`);
          return;
        }
        if (!cancelled) {
          setStatus("pending");
          setMessage(copy.waitingOwner(data.owner_username));
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : copy.claimFailed);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [copy, locale, pairCode, router, token]);

  return (
    <div className="mx-auto max-w-md px-6 py-20">
        <Card>
        <CardHeader>
          <CardTitle className="text-center font-serif text-2xl">{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 text-sm text-ink-light">
              <Loader2 size={16} className="animate-spin" /> {copy.verifying}
            </div>
          )}
          {status === "pending" && (
            <>
              <p className="text-sm text-ink">{message}</p>
              <Button variant="outline" onClick={() => router.push(withLocalePath(locale, "/config"))}>{copy.backToDevices}</Button>
            </>
          )}
          {status === "error" && (
            <>
              <p className="text-sm text-red-600">{message}</p>
              <Button variant="outline" onClick={() => router.push(withLocalePath(locale, "/config"))}>{copy.backToDevices}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense>
      <ClaimPageInner />
    </Suspense>
  );
}
