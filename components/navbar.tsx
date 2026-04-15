"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Menu, X, Github, User, Languages } from "lucide-react";
import { authHeaders, clearToken, fetchCurrentUser, onAuthChanged } from "@/lib/auth";
import { localeFromPathname, pickByLocale, t, withLocalePath } from "@/lib/i18n";
import { UserDropdown } from "@/components/user-dropdown";
import { useHoverDropdown } from "@/components/ui/use-hover-dropdown";

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = localeFromPathname(pathname || "/");
  const languageMenu = useHoverDropdown({ closeDelayMs: 180 });
  const localeLinks = [
    { locale: "en", label: "English" },
    { locale: "hr", label: "Hrvatski" },
    { locale: "zh", label: "中文" },
  ] as const;
  const languageLabel = pickByLocale(locale, {
    en: "Language",
    hr: "Jezik",
    zh: "语言",
  });
  const localeHref = (targetLocale: "en" | "hr" | "zh") => {
    const base = withLocalePath(targetLocale, pathname || "/");
    const qs = searchParams.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const navLinks = [
    { href: "/", label: t(locale, "nav.home") },
    { href: "/docs", label: t(locale, "nav.docs") },
    { href: "/discover", label: t(locale, "nav.discover") },
    { href: "/flash", label: t(locale, "nav.flash") },
    { href: "/studio", label: t(locale, "nav.studio") },
  ];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refreshUser = useCallback(() => {
    fetchCurrentUser()
      .then((d) => setUsername(d?.username || null))
      .catch(() => setUsername(null));
  }, []);

  useEffect(() => {
    refreshUser();
  }, [pathname, refreshUser]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const off = onAuthChanged(refreshUser);
    const onFocus = () => refreshUser();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshUser]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
    clearToken();
    setUsername(null);
    router.replace(withLocalePath(locale, "/login"));
    router.refresh();
  };

  // Avoid hydration mismatch: initial SSR does not have stable auth state
  // (depends on client-side token/cookie). Render a stable placeholder until mounted.
  if (!hydrated) {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-ink/[0.07] bg-white/72 backdrop-blur-xl supports-backdrop-filter:bg-white/65">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6" />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-ink/[0.07] bg-white/72 backdrop-blur-xl supports-backdrop-filter:bg-white/65 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <nav className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href={withLocalePath(locale, "/")} className="flex items-center gap-2 group">
          <Image 
            src="/images/logo.png" 
            alt="InkWell Logo" 
            width={32} 
            height={32} 
            className="rounded-[10px] object-contain shadow-sm ring-1 ring-black/4"
          />
          <span className="text-lg font-semibold text-ink tracking-tight">
            InkWell
          </span>
        </Link>

        {/* Desktop nav links (centered) */}
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 md:flex">
          <div className="pointer-events-auto flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={withLocalePath(locale, link.href)}
                className="text-sm text-ink-light hover:text-ink transition-colors duration-200 rounded-lg px-1 -mx-1 py-0.5 hover:bg-ink/5"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="https://github.com/datascale-ai/inksight"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1 text-ink-light hover:text-ink hover:bg-ink/5 transition-colors duration-200"
          >
            <Github size={18} />
          </a>
          {username ? (
            <UserDropdown locale={locale} username={username} onLogout={handleLogout} />
          ) : (
            <Link
              href={withLocalePath(locale, "/login")}
              className="text-sm text-ink-light hover:text-ink transition-colors duration-200 rounded-lg px-2 py-1 hover:bg-ink/5"
            >
              {t(locale, "nav.login")}
            </Link>
          )}
          <div
            className="relative"
            onMouseEnter={languageMenu.openMenu}
            onMouseLeave={languageMenu.scheduleClose}
            onFocusCapture={languageMenu.openMenu}
            onBlurCapture={languageMenu.scheduleClose}
          >
            <button
              type="button"
              className="rounded-lg p-1 text-ink-light hover:text-ink hover:bg-ink/5 transition-colors duration-200"
              aria-haspopup="menu"
              aria-expanded={languageMenu.open}
              aria-label={languageLabel}
              title={languageLabel}
            >
              <Languages size={18} />
            </button>
            {languageMenu.open && (
              <div
                className="absolute right-0 top-[calc(100%+8px)] z-[100] min-w-36 rounded-2xl border border-ink/10 bg-white/95 p-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-xl"
                role="menu"
                onMouseEnter={languageMenu.openMenu}
                onMouseLeave={languageMenu.scheduleClose}
              >
                {localeLinks.map((item) => (
                  <Link
                    key={item.locale}
                    href={localeHref(item.locale)}
                    className={`block rounded-xl px-2 py-2 text-sm transition-colors duration-200 ${
                      locale === item.locale
                        ? "bg-ink/7 text-ink font-medium"
                        : "text-ink-light hover:bg-ink/5 hover:text-ink"
                    }`}
                    role="menuitem"
                    onClick={languageMenu.closeMenu}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-ink"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-ink/[0.07] bg-white/95 backdrop-blur-xl">
          <div className="flex flex-col px-6 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={withLocalePath(locale, link.href)}
                className="text-sm text-ink-light hover:text-ink transition-colors py-1"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/datascale-ai/inksight"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-ink-light hover:text-ink transition-colors py-1"
            >
              <Github size={16} />
              GitHub
            </a>
            {username ? (
              <div className="flex items-center justify-between py-1">
                <Link
                  href={withLocalePath(locale, "/profile")}
                  className="flex items-center gap-1 text-sm text-ink-light hover:text-ink transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <User size={14} />
                  {username}
                </Link>
                <button onClick={handleLogout} className="text-sm text-ink-light hover:text-ink">
                  {t(locale, "nav.logout")}
                </button>
              </div>
            ) : (
              <Link
                href={withLocalePath(locale, "/login")}
                className="text-sm text-ink-light hover:text-ink transition-colors py-1"
                onClick={() => setMobileOpen(false)}
              >
                {t(locale, "nav.login")}
              </Link>
            )}
            <div className="pt-1">
              <div className="text-xs uppercase tracking-[0.14em] text-ink-light/80">
                {languageLabel}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {localeLinks.map((item) => (
                  <Link
                    key={item.locale}
                    href={localeHref(item.locale)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      locale === item.locale
                        ? "border-ink bg-ink text-white"
                        : "border-ink/15 text-ink-light hover:border-ink hover:text-ink"
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
