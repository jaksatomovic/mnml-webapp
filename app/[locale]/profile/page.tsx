"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, LogOut, Loader2, AlertCircle } from "lucide-react";
import { authHeaders, fetchCurrentUser, clearToken, onAuthChanged } from "@/lib/auth";
import { localeFromPathname, pickByLocale, withLocalePath } from "@/lib/i18n";

interface ProfileData {
  user_id: number;
  username: string;
  phone: string;
  email: string;
  role: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const tr = useCallback((zh: string, en: string, hr = en) => pickByLocale(locale, { zh, en, hr }), [locale]);

  const [currentUser, setCurrentUser] = useState<{ user_id: number; username: string } | null | undefined>(undefined);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const [bindEmail, setBindEmail] = useState("");
  const [bindCode, setBindCode] = useState("");
  const [bindStep, setBindStep] = useState<"idle" | "code_sent">("idle");
  const [bindLoading, setBindLoading] = useState(false);
  const [bindCooldown, setBindCooldown] = useState(0);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshCurrentUser = useCallback(() => {
    fetchCurrentUser()
      .then((d) => setCurrentUser(d ? { user_id: d.user_id, username: d.username } : null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    refreshCurrentUser();
  }, [refreshCurrentUser]);

  useEffect(() => {
    const off = onAuthChanged(refreshCurrentUser);
    return () => {
      off();
    };
  }, [refreshCurrentUser]);

  const loadProfile = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/profile", { headers: authHeaders() });
      if (res.status === 401) {
        clearToken();
        setCurrentUser(null);
        router.push(withLocalePath(locale, "/login"));
        return;
      }
      if (!res.ok) {
        showToast(tr("加载个人信息失败", "Failed to load profile", "Učitavanje profila nije uspjelo"), "error");
        return;
      }
      const data: ProfileData = await res.json();
      setProfileData(data);
    } catch {
      showToast(tr("加载个人信息失败", "Failed to load profile", "Učitavanje profila nije uspjelo"), "error");
    } finally {
      setLoading(false);
    }
  }, [currentUser, locale, router, showToast, tr]);

  useEffect(() => {
    if (currentUser) {
      loadProfile();
    }
  }, [currentUser, loadProfile]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
    clearToken();
    setCurrentUser(null);
    router.push(withLocalePath(locale, "/"));
  };

  const handleBindEmailSendCode = async () => {
    if (!bindEmail.trim()) {
      showToast(tr("请输入邮箱", "Please enter email", "Unesi email"), "error");
      return;
    }
    setBindLoading(true);
    try {
      const res = await fetch("/api/user/bind-email/send-code", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: bindEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tr("发送失败", "Failed to send code", "Slanje koda nije uspjelo"));
      setBindStep("code_sent");
      setBindCooldown(60);
      const timer = setInterval(() => {
        setBindCooldown((prev) => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
      }, 1000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr("发送失败", "Failed", "Neuspjeh"), "error");
    } finally {
      setBindLoading(false);
    }
  };

  const handleBindEmailVerify = async () => {
    if (!bindCode.trim()) {
      showToast(tr("请输入验证码", "Please enter verification code", "Unesi verifikacijski kod"), "error");
      return;
    }
    setBindLoading(true);
    try {
      const res = await fetch("/api/user/bind-email", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: bindEmail.trim(), code: bindCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tr("绑定失败", "Binding failed", "Povezivanje nije uspjelo"));
      showToast(tr("邮箱绑定成功", "Email bound successfully", "Email je uspješno povezan"), "success");
      setBindEmail("");
      setBindCode("");
      setBindStep("idle");
      await loadProfile();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr("绑定失败", "Failed", "Neuspjeh"), "error");
    } finally {
      setBindLoading(false);
    }
  };

  if (currentUser === undefined || loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-center py-20 text-ink-light">
          <Loader2 size={24} className="animate-spin mr-2" /> {tr("加载中...", "Loading...", "Učitavanje...")}
        </div>
      </div>
    );
  }

  if (currentUser === null) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{tr("请先登录", "Please sign in first")}</p>
                <Link href={withLocalePath(locale, "/login")}>
                  <Button size="sm" className="mt-2">
                    {tr("登录 / 注册", "Sign In / Sign Up")}
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-serif text-3xl font-bold text-ink mb-8">{tr("个人信息", "Profile")}</h1>

      <div className="space-y-6">
        {/* Account summary card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={18} /> {tr("账号信息", "Account Information")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-ink-light mb-1">{tr("用户名", "Username")}</p>
                <p className="text-base font-medium text-ink">{profileData?.username || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-ink-light mb-1">{tr("账号角色", "Role")}</p>
                <p className="text-base font-medium text-ink">{profileData?.role === "root" ? "Root" : tr("普通用户", "User", "Korisnik")}</p>
              </div>
              {profileData?.phone && (
                <div>
                  <p className="text-sm text-ink-light mb-1">{tr("手机号", "Phone")}</p>
                  <p className="text-base font-medium text-ink">{profileData.phone}</p>
                </div>
              )}
              {profileData?.email ? (
                <div>
                  <p className="text-sm text-ink-light mb-1">{tr("邮箱", "Email")}</p>
                  <p className="text-base font-medium text-ink">{profileData.email}</p>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 mb-3">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{tr("尚未绑定邮箱，绑定后可用于找回密码", "No email bound. Bind one for password recovery.", "Email još nije povezan. Poveži ga za oporavak lozinke.")}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="email"
                      value={bindEmail}
                      onChange={(e) => setBindEmail(e.target.value)}
                      disabled={bindStep === "code_sent"}
                      placeholder={tr("输入邮箱地址", "Email", "Email")}
                      className="w-52 rounded-xl border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={bindCode}
                      onChange={(e) => setBindCode(e.target.value)}
                      disabled={bindStep === "idle"}
                      maxLength={6}
                      placeholder={tr("验证码", "Code", "Kod")}
                      className="w-24 rounded-xl border border-ink/20 px-3 py-2 text-sm tracking-widest disabled:opacity-40"
                    />
                    {bindStep === "idle" ? (
                      <Button
                        size="sm"
                        onClick={handleBindEmailSendCode}
                        disabled={bindLoading || !bindEmail.trim()}
                      >
                        {bindLoading ? <Loader2 size={14} className="animate-spin" /> : tr("发送验证码", "Send Code", "Pošalji kod")}
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" onClick={handleBindEmailVerify} disabled={bindLoading || !bindCode.trim()}>
                          {bindLoading ? <Loader2 size={14} className="animate-spin" /> : tr("绑定", "Bind", "Poveži")}
                        </Button>
                        <button
                          type="button"
                          disabled={bindCooldown > 0 || bindLoading}
                          onClick={handleBindEmailSendCode}
                          className="text-xs text-ink-light underline disabled:opacity-50"
                        >
                          {bindCooldown > 0 ? `${bindCooldown}s` : tr("重新发送", "Resend", "Pošalji ponovno")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="pt-4 border-t border-ink/10">
              <Button variant="outline" onClick={handleLogout} className="text-ink-light hover:text-ink">
                <LogOut size={14} className="mr-2" />
                {tr("登出", "Logout")}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-fade-in ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : toast.type === "error"
              ? "bg-red-50 text-red-800 border border-red-200"
              : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
