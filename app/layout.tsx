import type { Metadata } from "next";
import { Inter, Noto_Serif_SC } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { t } from "@/lib/i18n";
import { localeForRequest } from "@/lib/locale-server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSerifSc = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-noto-serif-sc",
});

const baseMetadata: Metadata = {
  title: "InkSight",
  description: "InkSight is an AI e-ink desk companion with online flashing, device configuration, and a community mode plaza.",
  keywords: ["InkSight", "E-Ink", "ESP32", "LLM", "desk companion"],
  manifest: "/manifest.json",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeForRequest();
  return {
    ...baseMetadata,
    title: t(locale, "meta.title"),
    description: t(locale, "meta.description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await localeForRequest();
  const lang = locale === "zh" ? "zh-CN" : locale === "hr" ? "hr-HR" : "en-US";

  return (
    <html lang={lang}>
      <body className={`${inter.variable} ${notoSerifSc.variable} antialiased`}>
        <Navbar />
        <main className="min-h-screen pb-px">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
