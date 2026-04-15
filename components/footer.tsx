"use client";

import { usePathname } from "next/navigation";
import { Github } from "lucide-react";
import { localeFromPathname, pickByLocale, t } from "@/lib/i18n";

export function Footer() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const brandGlyph = pickByLocale(locale, { zh: "墨", en: "I", hr: "I" });
  const brandName = pickByLocale(locale, { zh: "墨鱼InkWell", en: "InkWell", hr: "InkWell" });
  const licenseText = pickByLocale(locale, {
    zh: "Released under the MIT License.",
    en: "Released under the MIT License.",
    hr: "Objavljeno pod MIT licencom.",
  });
  return (
    <footer className="border-t border-ink/[0.08] bg-linear-to-b from-[#fafafa] to-[#f0f0f2]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-ink/20 bg-ink text-white text-xs font-bold font-serif shadow-sm">
                {brandGlyph}
              </div>
              <span className="text-base font-semibold text-ink tracking-tight">
                {brandName}
              </span>
            </div>
            <p className="text-sm text-ink-light leading-relaxed">
              {t(locale, "footer.desc")}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-ink mb-3">{t(locale, "footer.links")}</h4>
            <ul className="space-y-2 text-sm text-ink-light">
              <li>
                <a
                  href="https://github.com/datascale-ai/inksight"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink transition-colors inline-flex items-center gap-1.5"
                >
                  <Github size={14} />
                  {t(locale, "footer.githubRepo")}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/datascale-ai/inksight/blob/main/docs/hardware.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink transition-colors"
                >
                  {t(locale, "footer.hardwareGuide")}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/datascale-ai/inksight/blob/main/docs/api.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink transition-colors"
                >
                  {t(locale, "footer.apiDocs")}
                </a>
              </li>
            </ul>
          </div>

          {/* Tech */}
          <div>
            <h4 className="text-sm font-semibold text-ink mb-3">{t(locale, "footer.techStack")}</h4>
            <ul className="space-y-2 text-sm text-ink-light">
              <li>{t(locale, "footer.tech.item1")}</li>
              <li>{t(locale, "footer.tech.item2")}</li>
              <li>{t(locale, "footer.tech.item3")}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-ink/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-ink-light">
            &copy; {new Date().getFullYear()} {brandName}. {licenseText}
          </p>
          <p className="text-xs text-ink-light">
            {t(locale, "footer.tagline")}
          </p>
        </div>
      </div>
    </footer>
  );
}
