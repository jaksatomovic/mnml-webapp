"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { setToken } from "@/lib/auth";
import { localeFromPathname, pickByLocale } from "@/lib/i18n";

const PHONE_REGION_OPTIONS = [
  { region: "CN", code: "+86", labelEn: "China Mainland", labelHr: "Kontinentalna Kina", labelZh: "中国大陆" },
  { region: "HK", code: "+852", labelEn: "Hong Kong", labelHr: "Hong Kong", labelZh: "中国香港" },
  { region: "TW", code: "+886", labelEn: "Taiwan", labelHr: "Tajvan", labelZh: "中国台湾" },
  { region: "SG", code: "+65", labelEn: "Singapore", labelHr: "Singapur", labelZh: "新加坡" },
  { region: "JP", code: "+81", labelEn: "Japan", labelHr: "Japan", labelZh: "日本" },
  { region: "KR", code: "+82", labelEn: "South Korea", labelHr: "Južna Koreja", labelZh: "韩国" },
  { region: "US", code: "+1", labelEn: "United States", labelHr: "Sjedinjene Države", labelZh: "美国" },
  { region: "CA", code: "+1", labelEn: "Canada", labelHr: "Kanada", labelZh: "加拿大" },
  { region: "GB", code: "+44", labelEn: "United Kingdom", labelHr: "Ujedinjeno Kraljevstvo", labelZh: "英国" },
  { region: "DE", code: "+49", labelEn: "Germany", labelHr: "Njemačka", labelZh: "德国" },
  { region: "FR", code: "+33", labelEn: "France", labelHr: "Francuska", labelZh: "法国" },
  { region: "AU", code: "+61", labelEn: "Australia", labelHr: "Australija", labelZh: "澳大利亚" },
  { region: "IN", code: "+91", labelEn: "India", labelHr: "Indija", labelZh: "印度" },
] as const;

function LoginForm() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const tr = (zh: string, en: string, hr = en) =>
    pickByLocale(locale, { zh, en, hr });
  const searchParams = useSearchParams();
  // Support both 'next' (internal route) and 'redirect_url' (external URL)
  // Get redirect_url - useSearchParams should auto-decode, but ensure it's decoded
  const redirectUrlParam = searchParams.get("redirect_url");
  // Decode if needed (handle cases where it might still be encoded)
  let redirectUrl: string | null = null;
  if (redirectUrlParam) {
    try {
      // Try to decode, if it fails it's already decoded
      redirectUrl = decodeURIComponent(redirectUrlParam);
    } catch {
      redirectUrl = redirectUrlParam;
    }
  }
  const next = searchParams.get("next") || `/${locale}/config`;
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [resetStep, setResetStep] = useState<"email" | "verify">("email");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phoneRegion, setPhoneRegion] = useState<(typeof PHONE_REGION_OPTIONS)[number]["region"]>("CN");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [successMsg, setSuccessMsg] = useState("");

  const startCooldown = () => {
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((prev) => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
    }, 1000);
  };

  const handleResetSendCode = async () => {
    setError("");
    if (!email.trim()) {
      setError(tr("请输入邮箱", "Email is required", "Email je obavezan"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || tr("发送验证码失败", "Failed to send code", "Slanje koda nije uspjelo"));
        return;
      }
      setResetStep("verify");
      startCooldown();
    } catch {
      setError(tr("网络错误", "Network error", "Mrežna greška"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetVerify = async () => {
    setError("");
    if (!verifyCode.trim()) {
      setError(tr("请输入验证码", "Enter verification code", "Unesite verifikacijski kod"));
      return;
    }
    if (password.length < 4) {
      setError(tr("密码至少 4 位", "Password must be at least 4 characters", "Lozinka mora imati barem 4 znaka"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: verifyCode.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || tr("重置失败", "Reset failed", "Resetiranje nije uspjelo"));
        return;
      }
      setSuccessMsg(tr("密码重置成功，请登录", "Password reset successful, please sign in", "Lozinka je resetirana, prijavite se"));
      setMode("login");
      setResetStep("email");
      setPassword("");
      setEmail("");
      setVerifyCode("");
    } catch {
      setError(tr("网络错误", "Network error", "Mrežna greška"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "reset") {
      if (resetStep === "email") return handleResetSendCode();
      return handleResetVerify();
    }
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      if (mode === "register" && !email.trim()) {
        setError(tr("邮箱为必填项", "Email is required", "Email je obavezan"));
        setLoading(false);
        return;
      }

      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload: Record<string, string> = { username, password };
      if (mode === "register" && phone.trim()) {
        payload.phone = phone.trim();
        payload.phone_region = phoneRegion;
      }
      if (mode === "register" && email.trim()) payload.email = email.trim();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || tr("操作失败", "Operation failed", "Radnja nije uspjela"));
        return;
      }
      if (mode === "register") {
        setSuccessMsg(tr("注册成功，请登录", "Registration successful, please sign in", "Registracija je uspjela, prijavite se"));
        setMode("login");
        setPassword("");
        setPhoneRegion("CN");
        setPhone("");
        setEmail("");
        return;
      }
      if (data.token) {
        setToken(data.token);
        const maxAge = 30 * 24 * 60 * 60;
        document.cookie = `ink_session=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }
      
      if (redirectUrl) {
        const trimmedUrl = redirectUrl.trim();
        if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
          try {
            const urlObj = new URL(trimmedUrl);
            urlObj.searchParams.set("_token", data.token);
            window.location.href = urlObj.toString();
          } catch {
            window.location.href = trimmedUrl;
          }
          return;
        }
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(tr("网络错误", "Network error", "Mrežna greška"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm px-6 py-20">
      <Card>
        <CardHeader>
          <CardTitle className="text-center font-serif text-2xl">
            {mode === "login"
              ? tr("登录", "Sign In", "Prijava")
              : mode === "register"
                ? tr("注册", "Sign Up", "Registracija")
                : tr("重置密码", "Reset Password", "Reset lozinke")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== "reset" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    {tr("用户名", "Username", "Korisničko ime")}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={2}
                    maxLength={30}
                    autoComplete="username"
                    placeholder={tr("用于显示的昵称（非手机号/邮箱）", "Choose a display name", "Odaberite ime za prikaz")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">{tr("密码", "Password", "Lozinka")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={4}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
            {mode === "register" && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    {tr("邮箱", "Email", "Email")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder={tr("必填，用于找回账号", "Required, used for account recovery", "Obavezno, koristi se za oporavak računa")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    {tr("手机号", "Phone", "Telefon")}
                    <span className="text-ink-light text-xs ml-1">({tr("选填", "optional", "nije obavezno")})</span>
                  </label>
                  <div className="flex w-full flex-col gap-2">
                    <select
                      value={phoneRegion}
                      onChange={(e) => setPhoneRegion(e.target.value as (typeof PHONE_REGION_OPTIONS)[number]["region"])}
                      className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                    >
                      {PHONE_REGION_OPTIONS.map((option) => (
                        <option key={`${option.region}-${option.code}`} value={option.region}>
                          {option.code} {pickByLocale(locale, { zh: option.labelZh, en: option.labelEn, hr: option.labelHr })}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      placeholder={tr("本地手机号", "Local phone number", "Lokalni broj telefona")}
                      className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
            {mode === "reset" && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    {tr("注册邮箱", "Email", "Email")}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={resetStep === "verify"}
                    placeholder={tr("输入注册时使用的邮箱", "Enter your registered email", "Unesite email s kojim ste se registrirali")}
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
                  />
                </div>
                {resetStep === "verify" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">
                        {tr("验证码", "Verification Code", "Verifikacijski kod")}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value)}
                          maxLength={6}
                          placeholder="000000"
                          className="flex-1 rounded-xl border border-ink/20 px-3 py-2 text-sm tracking-widest"
                        />
                        <button
                          type="button"
                          disabled={cooldown > 0 || loading}
                          onClick={handleResetSendCode}
                          className="shrink-0 rounded-xl border border-ink/20 px-3 py-2 text-xs disabled:opacity-50"
                        >
                          {cooldown > 0
                            ? `${cooldown}s`
                            : tr("重新发送", "Resend", "Pošalji ponovno")}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">
                        {tr("新密码", "New Password", "Nova lozinka")}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={4}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            {successMsg && (
              <p className="text-sm text-green-600">{successMsg}</p>
            )}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 size={14} className="animate-spin mr-1" />}
              {mode === "login"
                ? tr("登录", "Sign In", "Prijava")
                : mode === "register"
                  ? tr("注册", "Sign Up", "Registracija")
                  : resetStep === "email"
                    ? tr("发送验证码", "Send Verification Code", "Pošalji verifikacijski kod")
                    : tr("重置密码", "Reset Password", "Reset lozinke")}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-ink-light">
            {mode === "login" ? (
              <div className="space-y-2">
                <div>
                  {tr("没有账号？", "No account?", "Nemate račun?")}{" "}
                  <button onClick={() => { setMode("register"); setError(""); setSuccessMsg(""); }} className="text-ink underline">
                    {tr("注册", "Sign up", "Registrirajte se")}
                  </button>
                </div>
                <div>
                  <button onClick={() => { setMode("reset"); setResetStep("email"); setError(""); setSuccessMsg(""); setPassword(""); setEmail(""); setVerifyCode(""); }} className="text-ink underline">
                    {tr("忘记密码？", "Forgot password?", "Zaboravili ste lozinku?")}
                  </button>
                </div>
              </div>
            ) : (
              <span>
                {mode === "register"
                  ? tr("已有账号？", "Already have an account?", "Već imate račun?")
                  : tr("想起密码了？", "Remembered your password?", "Sjetili ste se lozinke?")}{" "}
                <button onClick={() => { setMode("login"); setError(""); setSuccessMsg(""); }} className="text-ink underline">
                  {tr("登录", "Sign in", "Prijava")}
                </button>
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
