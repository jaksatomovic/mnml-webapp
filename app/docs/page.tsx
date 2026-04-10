import Image from "next/image";
import Link from "next/link";
import { Lightbulb, Zap } from "lucide-react";
import { pickByLocale, withLocalePath } from "@/lib/i18n";
import { localeForRequest } from "@/lib/locale-server";

export default async function DocsPage() {
  const locale = await localeForRequest();
  const tr = (zh: string, en: string, hr = en) =>
    pickByLocale(locale, { zh, en, hr });

  return (
    <article className="docs-prose">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="!mb-0">{tr("快速开始", "Quick Start", "Brzi početak")}</h1>
        <div className="flex-shrink-0">
          <Image
            src={locale === "zh" ? "/images/QQ.jpg" : "/images/QQ_EN.jpg"}
            alt={tr("QQ群", "QQ Group", "QQ grupa")}
            width={192}
            height={96}
            className="h-24 w-auto object-contain rounded-md border border-ink/10 shadow-sm"
          />
        </div>
      </div>

      <blockquote>
        {tr(
          "InkSight 是一块适合放在桌面的电子墨水信息屏。先准备推荐硬件，完成刷机与配网，再通过 WebApp 配置内容即可。",
          "InkSight is a calm e-ink desk companion. Start with the recommended hardware, flash the firmware, connect Wi-Fi, then configure content from the web app.",
          "InkSight je smireni e-ink suputnik za radni stol. Krenite s preporučenim hardverom, flashajte firmware, spojite Wi‑Fi i zatim podesite sadržaj kroz web app.",
        )}
      </blockquote>

      <p>
        {tr(
          "如果你现在更关心“官网能做什么、应该从哪里开始”，建议先读网站使用指南。它会按真实入口带你走一遍模式广场、无设备体验、在线刷机、设备配置和个人信息页。",
          "If you want to understand the website before wiring hardware, start with the website guide. It walks through the actual product entry points: discover, no-device preview, flashing, device config, and profile settings.",
          "Ako prvo želite razumjeti web prije spajanja hardvera, krenite s vodičem za web. On prolazi stvarne ulazne točke proizvoda: discover, preview bez uređaja, flashanje, konfiguraciju uređaja i profile postavke.",
        )}
      </p>

      <h2>{tr("建议阅读顺序", "Suggested Reading Order", "Preporučeni redoslijed čitanja")}</h2>
      <ul>
        <li><Link href={withLocalePath(locale, "/docs/website")}>{tr("网站使用指南", "Website Guide", "Vodič za web")}</Link></li>
        <li><Link href={withLocalePath(locale, "/docs/hardware")}>{tr("硬件清单", "Hardware", "Hardver")}</Link></li>
        <li><Link href={withLocalePath(locale, "/docs/assembly")}>{tr("组装指南", "Assembly Guide", "Vodič za sastavljanje")}</Link></li>
        <li><Link href={withLocalePath(locale, "/docs/flash")}>{tr("Web 在线刷机", "Web Flasher", "Web flasher")}</Link></li>
        <li><Link href={withLocalePath(locale, "/docs/api-key")}>{tr("配置 API Key", "Configure API Key", "Podesi API key")}</Link></li>
        <li><Link href={withLocalePath(locale, "/docs/config")}>{tr("设备配置", "Device Configuration", "Konfiguracija uređaja")}</Link></li>
        <li><Link href={withLocalePath(locale, "/docs/deploy")}>{tr("本地部署", "Local Deployment", "Lokalni deployment")}</Link></li>
      </ul>

      <div className="callout callout-tip">
        <div className="callout-icon">
          <Lightbulb size={16} />
        </div>
        <div>
          <p className="callout-title">{tr("入门建议", "Tip", "Savjet")}</p>
          <p>
            {tr(
              "第一次搭建建议使用 ESP32-C3 + 4.2寸 SPI 墨水屏模块，并优先使用 USB 供电排障。",
              "For a first build, use USB power and the recommended `ESP32-C3 + 4.2-inch e-paper` setup.",
              "Za prvu izradu preporučujemo USB napajanje i preporučeni `ESP32-C3 + 4.2-inch e-paper` setup.",
            )}
          </p>
        </div>
      </div>

      <div className="callout callout-important">
        <div className="callout-icon">
          <Zap size={16} />
        </div>
        <div>
          <p className="callout-title">{tr("当前产品入口", "Where settings live", "Gdje su postavke")}</p>
          <p>
            {tr(
              "当前版本中，设备配置页用于管理设备的展示行为与模式，个人信息页则用于管理 AI 算力（包括平台免费额度和自定义大模型 API Key）。",
              "In the current version, use Device Configuration to manage device display behavior and modes, and Profile to manage AI compute resources, including platform free quota and custom LLM API keys.",
              "U trenutnoj verziji koristite Device Configuration za upravljanje prikazom i modovima uređaja, a Profile za upravljanje AI resursima, uključujući besplatnu kvotu platforme i vlastite LLM API ključeve.",
            )}
          </p>
        </div>
      </div>

      {locale === "zh" ? (
        <>
          <hr />
          <p>
            如果你要本地开发、自托管部署、联调预览或刷机流程，请直接查看{" "}
            <Link href={withLocalePath(locale, "/docs/deploy")}>本地部署</Link>{" "}
            文档。
          </p>
        </>
      ) : (
        <p>
          {tr(
            "",
            "If you plan to develop locally, self-host, debug previews, or test the flashing flow, jump straight to the local deployment guide.",
            "Ako planirate lokalni razvoj, self-hosting, debug previewa ili testiranje flashanja, prijeđite ravno na vodič za lokalni deployment.",
          )}{" "}
          <Link href={withLocalePath(locale, "/docs/deploy")}>
            {tr("本地部署", "Local Deployment", "Lokalni deployment")}
          </Link>.
        </p>
      )}
    </article>
  );
}
