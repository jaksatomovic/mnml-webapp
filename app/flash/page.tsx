"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Usb,
  MousePointerClick,
  ListOrdered,
  Zap,
  CheckCircle2,
  AlertCircle,
  Terminal,
  RefreshCw,
  X,
} from "lucide-react";
import { fetchCurrentUser, onAuthChanged } from "@/lib/auth";
import { localeFromPathname, pickByLocale, withLocalePath } from "@/lib/i18n";
import { buildReleaseKey, buildReleaseLabel, getPreferredBuild, type FirmwareReleaseOption } from "./release-options";

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: object): Promise<unknown>;
    };
  }
}

type FlashStatus =
  | "initializing"
  | "loading_releases"
  | "ready"
  | "connecting"
  | "flashing"
  | "success"
  | "failed";

type FirmwareRelease = FirmwareReleaseOption & {
  version: string;
  tag: string;
  published_at: string | null;
  download_url: string;
  size_bytes: number | null;
  chip_family: string;
  asset_name: string;
  manifest: {
    name: string;
    version: string;
    builds: Array<{
      chipFamily: string;
      parts: Array<{
        path: string;
        offset: number;
      }>;
    }>;
  };
};

export default function FlashPage() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const tr = useCallback(
    (zh: string, en: string, hr = en) => pickByLocale(locale, { zh, en, hr }),
    [locale],
  );
  const stepsLocalized = [
    {
      icon: Usb,
      title: tr("连接 USB", "Connect USB", "Poveži USB"),
      desc: tr(
        "使用 USB-C 数据线将 ESP32-C3 开发板连接到电脑",
        "Connect your ESP32-C3 board using a USB-C data cable.",
        "Poveži svoju ESP32-C3 pločicu s računalom preko USB-C podatkovnog kabela.",
      ),
    },
    {
      icon: MousePointerClick,
      title: tr("点击刷写", "Click Flash", "Pokreni flashanje"),
      desc: tr(
        "点击下方的「刷写固件」按钮，浏览器将弹出串口选择窗口",
        'Click "Flash Firmware" and allow serial port access.',
        'Klikni "Flash Firmware" i dopusti pristup serijskom portu.',
      ),
    },
    {
      icon: ListOrdered,
      title: tr("选择端口", "Select Port", "Odaberi port"),
      desc: tr(
        "在弹出窗口中选择你的 ESP32 设备对应的串口",
        "Select the serial port corresponding to your ESP32 device.",
        "Odaberi serijski port koji odgovara tvom ESP32 uređaju.",
      ),
    },
    {
      icon: Zap,
      title: tr("开始刷写", "Start Flashing", "Započni flashanje"),
      desc: tr(
        "固件将自动下载并写入设备，等待进度条完成即可",
        "Firmware will be downloaded and written automatically.",
        "Firmware će se automatski preuzeti i zapisati na uređaj.",
      ),
    },
  ];
  const flashStatusLabel = {
    initializing: tr("初始化中", "Initializing", "Inicijalizacija"),
    loading_releases: tr("加载固件版本中", "Loading releases", "Učitavanje verzija"),
    ready: tr("就绪", "Ready", "Spremno"),
    connecting: tr("等待串口连接授权", "Waiting serial permission", "Čekam dozvolu za serial"),
    flashing: tr("刷写进行中", "Flashing", "Flashanje u tijeku"),
    success: tr("刷写成功", "Success", "Uspjeh"),
    failed: tr("失败，请重试", "Failed, retry", "Neuspjeh, pokušaj ponovno"),
  };
  const [status, setStatus] = useState<FlashStatus>("initializing");
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [selectedReleaseKey, setSelectedReleaseKey] = useState<string>("");
  const [releaseError, setReleaseError] = useState<string>("");
  const [manualFirmwareUrl, setManualFirmwareUrl] = useState<string>("");
  const [useManualFirmware, setUseManualFirmware] = useState<boolean>(false);
  const [manualUrlVerified, setManualUrlVerified] = useState<boolean>(false);
  const [manualUrlVerifying, setManualUrlVerifying] = useState<boolean>(false);
  const [manualUrlMessage, setManualUrlMessage] = useState<string>("");
  const [flashProgress, setFlashProgress] = useState<number>(0);
  const [serialSupported, setSerialSupported] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<string[]>([
    tr("[系统] InkSight Web Flasher 已就绪", "[system] InkSight Web Flasher ready", "[sustav] InkSight Web Flasher je spreman"),
    tr("[提示] 请使用 Chrome 或 Edge 浏览器以获得最佳体验", "[tip] Use Chrome or Edge for best compatibility", "[savjet] Koristi Chrome ili Edge za najbolju kompatibilnost"),
    tr("[提示] 确保已安装 ESP32 USB 驱动程序", "[tip] Ensure ESP32 USB driver is installed", "[savjet] Provjeri da je ESP32 USB driver instaliran"),
  ]);
  const [showPostFlashGuide, setShowPostFlashGuide] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "logged_in" | "guest">("checking");
  const [skipLoginGate, setSkipLoginGate] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<InstanceType<typeof import("esptool-js").Transport> | null>(null);

  const parseApiJson = useCallback(async (res: Response) => {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      const preview = text.slice(0, 80).replace(/\s+/g, " ").trim();
      throw new Error(
        tr(
          `接口未返回 JSON（HTTP ${res.status}）。请检查 /api/firmware 路由或后端配置。${preview ? ` 响应片段: ${preview}` : ""}`,
          `Endpoint did not return JSON (HTTP ${res.status}). Check the /api/firmware route or backend config.${preview ? ` Response preview: ${preview}` : ""}`,
          `Endpoint nije vratio JSON (HTTP ${res.status}). Provjeri /api/firmware rutu ili backend konfiguraciju.${preview ? ` Dio odgovora: ${preview}` : ""}`,
        )
      );
    }
    return res.json();
  }, [tr]);

  useEffect(() => {
    setSerialSupported(!!navigator.serial);
  }, []);

  const refreshAuthState = useCallback(() => {
    fetchCurrentUser()
      .then((user) => {
        setAuthState(user ? "logged_in" : "guest");
      })
      .catch(() => setAuthState("guest"));
  }, []);

  useEffect(() => {
    refreshAuthState();
  }, [refreshAuthState]);

  useEffect(() => {
    const off = onAuthChanged(refreshAuthState);
    const onFocus = () => refreshAuthState();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshAuthState]);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_FIRMWARE_API_BASE?.replace(/\/$/, "");
    const endpoint = apiBase
      ? `${apiBase}/api/firmware/releases`
      : "/api/firmware/releases";

    const loadReleases = async () => {
      setStatus("loading_releases");
      setReleaseError("");
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await parseApiJson(res);
        if (!res.ok) {
          throw new Error(data?.message || tr("固件版本接口请求失败", "Firmware releases request failed", "Dohvat firmware verzija nije uspio"));
        }
        const list = (data?.releases || []) as FirmwareRelease[];
        if (!list.length) {
          throw new Error(tr("没有可用的固件版本，请先发布 GitHub Release", "No firmware releases available yet. Publish a GitHub Release first.", "Još nema dostupnih firmware verzija. Najprije objavi GitHub Release."));
        }
        setReleases(list);
        setSelectedReleaseKey(buildReleaseKey(list[0]));
        setLogs((prev) => [
          ...prev,
          tr(`[系统] 已加载 ${list.length} 个固件版本，默认选择 ${buildReleaseLabel(list[0])}`, `[system] Loaded ${list.length} firmware releases, default selected ${buildReleaseLabel(list[0])}`, `[sustav] Učitano je ${list.length} firmware verzija, zadano je odabrana ${buildReleaseLabel(list[0])}`),
        ]);
        setStatus("ready");
      } catch (err) {
        const message = err instanceof Error ? err.message : tr("加载固件版本失败", "Failed to load firmware releases", "Učitavanje firmware verzija nije uspjelo");
        setReleaseError(message);
        setUseManualFirmware(true);
        setStatus("ready");
        setLogs((prev) => [...prev, `[错误] ${message}`]);
        setLogs((prev) => [...prev, tr("[提示] 你可以切换到手动 URL 模式继续刷机", "[tip] You can switch to manual URL mode to continue flashing", "[savjet] Možeš se prebaciti na ručni URL način i nastaviti flashanje")]);
      }
    };

    loadReleases();
  }, [parseApiJson, tr]);

  useEffect(() => {
    const el = logEndRef.current;
    if (el?.parentElement) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const selectedRelease = releases.find((r) => buildReleaseKey(r) === selectedReleaseKey);
  const loginHref = `${withLocalePath(locale, "/login")}?next=${encodeURIComponent(withLocalePath(locale, "/flash"))}`;
  const [actualChip, setActualChip] = useState<string | null>(null);
  const [actualSizeMB, setActualSizeMB] = useState<string | null>(null);
  const sizeMB = actualSizeMB
    ?? (selectedRelease?.size_bytes
      ? (selectedRelease.size_bytes / (1024 * 1024)).toFixed(2)
      : null);

  const handleReloadReleases = async () => {
    const apiBase = process.env.NEXT_PUBLIC_FIRMWARE_API_BASE?.replace(/\/$/, "");
    const endpoint = apiBase
      ? `${apiBase}/api/firmware/releases?refresh=true`
      : "/api/firmware/releases?refresh=true";
    setStatus("loading_releases");
    setReleaseError("");
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await parseApiJson(res);
      if (!res.ok) {
        throw new Error(data?.message || tr("刷新固件版本失败", "Failed to refresh firmware releases", "Osvježavanje firmware verzija nije uspjelo"));
      }
      const list = (data?.releases || []) as FirmwareRelease[];
      if (!list.length) {
        throw new Error(tr("没有可用固件版本", "No firmware releases available", "Nema dostupnih firmware verzija"));
      }
      setReleases(list);
      setSelectedReleaseKey(buildReleaseKey(list[0]));
      setUseManualFirmware(false);
      setStatus("ready");
      setLogs((prev) => [...prev, tr("[系统] 已刷新固件版本列表", "[system] Refreshed firmware release list", "[sustav] Osvježena je lista firmware verzija")]);
    } catch (err) {
      const message = err instanceof Error ? err.message : tr("刷新固件版本失败", "Failed to refresh firmware releases", "Osvježavanje firmware verzija nije uspjelo");
      setReleaseError(message);
      setStatus("failed");
      setLogs((prev) => [...prev, `[错误] ${message}`]);
    }
  };

  const validateManualUrlFormat = (value: string): string | null => {
    if (!value) return tr("请输入固件 URL", "Please enter a firmware URL", "Unesi firmware URL");
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return tr("URL 格式不正确", "Invalid URL format", "Neispravan URL format");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return tr("URL 必须以 http:// 或 https:// 开头", "URL must start with http:// or https://", "URL mora početi s http:// ili https://");
    }
    if (!parsed.pathname.toLowerCase().endsWith(".bin")) {
      return tr("URL 必须指向 .bin 固件文件", "URL must point to a .bin firmware file", "URL mora voditi na .bin firmware datoteku");
    }
    return null;
  };

  const handleVerifyManualUrl = async () => {
    const formatError = validateManualUrlFormat(manualFirmwareUrl);
    if (formatError) {
      setManualUrlVerified(false);
      setManualUrlMessage(formatError);
      setLogs((prev) => [...prev, `[错误] ${formatError}`]);
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_FIRMWARE_API_BASE?.replace(/\/$/, "");
    const endpoint = apiBase
      ? `${apiBase}/api/firmware/validate-url?url=${encodeURIComponent(manualFirmwareUrl)}`
      : `/api/firmware/validate-url?url=${encodeURIComponent(manualFirmwareUrl)}`;

    setManualUrlVerifying(true);
    setManualUrlMessage("");
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await parseApiJson(res);
      if (!res.ok) {
        throw new Error(data?.message || tr("固件 URL 校验失败", "Firmware URL validation failed", "Provjera firmware URL-a nije uspjela"));
      }
      setManualUrlVerified(true);
      setManualUrlMessage(tr("链接校验通过，可以开始刷写", "URL verified. Ready to flash.", "URL je potvrđen. Spremno za flashanje."));
      if (data.content_length) {
        setActualSizeMB((Number(data.content_length) / (1024 * 1024)).toFixed(2));
      }
      setLogs((prev) => [...prev, tr("[系统] 手动固件 URL 校验通过", "[system] Manual firmware URL verified", "[sustav] Ručni firmware URL je potvrđen")]);
    } catch (err) {
      const message = err instanceof Error ? err.message : tr("固件 URL 校验失败", "Firmware URL validation failed", "Provjera firmware URL-a nije uspjela");
      setManualUrlVerified(false);
      setManualUrlMessage(message);
      setLogs((prev) => [...prev, `[错误] ${message}`]);
    } finally {
      setManualUrlVerifying(false);
    }
  };

  const getFirmwareUrl = (): string | null => {
    if (useManualFirmware) {
      if (!manualFirmwareUrl || !manualUrlVerified) return null;
      return `${window.location.origin}/api/firmware/download?url=${encodeURIComponent(manualFirmwareUrl)}`;
    }
    const selected = releases.find((r) => buildReleaseKey(r) === selectedReleaseKey);
    if (!selected) return null;
    const build = getPreferredBuild(selected);
    if (!build || !build.parts.length) return null;
    const rawUrl = build.parts[0].path;
    return `${window.location.origin}/api/firmware/download?url=${encodeURIComponent(rawUrl)}`;
  };

  const handleFlash = async () => {
    if (!navigator.serial) {
      addLog(tr("浏览器不支持 WebSerial API，请使用 Chrome 或 Edge", "Browser does not support WebSerial API. Use Chrome or Edge.", "Preglednik ne podržava WebSerial API. Koristi Chrome ili Edge."));
      setStatus("failed");
      return;
    }

    const firmwareUrl = getFirmwareUrl();
    if (!firmwareUrl) {
      addLog(tr("无法确定固件下载地址", "Could not determine firmware download URL", "Nije moguće odrediti URL za preuzimanje firmwarea"));
      setStatus("failed");
      return;
    }

    setStatus("connecting");
    setActualChip(null);
    setActualSizeMB(null);
    addLog(tr("正在请求串口权限...", "Requesting serial port permission...", "Tražim dozvolu za serijski port..."));

    let port: unknown;
    try {
      port = await navigator.serial.requestPort();
    } catch {
      addLog(tr("用户取消了串口选择或无可用串口", "User cancelled serial selection or no port is available", "Korisnik je odustao od odabira porta ili nema dostupnog porta"));
      setStatus("ready");
      return;
    }

    addLog(tr("串口已选择，正在连接设备...", "Serial port selected, connecting to device...", "Serijski port je odabran, spajam se na uređaj..."));

    try {
      const { ESPLoader, Transport } = await import("esptool-js");

      const transport = new Transport(port as ConstructorParameters<typeof Transport>[0], true);
      transportRef.current = transport;

      const loaderTerminal = {
        clean() { /* no-op */ },
        writeLine(data: string) { addLog(data); },
        write(data: string) {
          if (data.trim()) addLog(data.trim());
        },
      };

      const esploader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: loaderTerminal,
      });

      const chip = await esploader.main();
      setActualChip(chip);
      addLog(tr(`已连接: ${chip}`, `Connected: ${chip}`, `Povezano: ${chip}`));

      addLog(tr("正在下载固件...", "Downloading firmware...", "Preuzimam firmware..."));
      const fwResp = await fetch(firmwareUrl);
      if (!fwResp.ok) {
        throw new Error(tr(`固件下载失败: HTTP ${fwResp.status}`, `Firmware download failed: HTTP ${fwResp.status}`, `Preuzimanje firmwarea nije uspjelo: HTTP ${fwResp.status}`));
      }
      const fwBuffer = await fwResp.arrayBuffer();
      const fwData = new Uint8Array(fwBuffer);
      const fwBinaryStr = Array.from(fwData, (b) => String.fromCharCode(b)).join("");
      setActualSizeMB((fwData.length / (1024 * 1024)).toFixed(2));
      addLog(tr(`固件下载完成: ${(fwData.length / 1024).toFixed(0)} KB`, `Firmware downloaded: ${(fwData.length / 1024).toFixed(0)} KB`, `Firmware preuzet: ${(fwData.length / 1024).toFixed(0)} KB`));

      setStatus("flashing");
      setFlashProgress(0);
      addLog(tr("开始刷写固件，请勿断开 USB 连接...", "Starting firmware flash. Do not unplug USB...", "Pokrećem flashanje firmwarea. Nemoj odspajati USB..."));

      const header = Array.from(fwData.slice(0, 16), b => b.toString(16).padStart(2, "0")).join(" ");
      addLog(tr(`固件头部: ${header}`, `Firmware header: ${header}`, `Zaglavlje firmwarea: ${header}`));

      await esploader.writeFlash({
        fileArray: [{ data: fwBinaryStr, address: 0x0 }],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex: number, written: number, total: number) => {
          const pct = Math.round((written / total) * 100);
          setFlashProgress(pct);
        },
      });

      addLog(tr("固件写入完成，正在重启设备...", "Firmware written, rebooting device...", "Firmware je upisan, ponovno pokrećem uređaj..."));
      try {
        await transport.setRTS(true);
        await new Promise((r) => setTimeout(r, 100));
        await transport.setRTS(false);
        await new Promise((r) => setTimeout(r, 50));
      } catch { /* RTS toggle may fail on some adapters */ }

      try {
        await transport.disconnect();
      } catch { /* port may already be closed */ }
      transportRef.current = null;

      setStatus("success");
      setShowPostFlashGuide(true);
      addLog(tr("刷写成功！设备已重启，请按引导完成配网。", "Flash successful! Device rebooted. Follow the guide to finish provisioning.", "Flashanje je uspjelo! Uređaj je restartan. Slijedi vodič za dovršetak povezivanja."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(tr(`刷写失败: ${msg}`, `Flashing failed: ${msg}`, `Flashanje nije uspjelo: ${msg}`));
      setStatus("failed");
      try {
        if (transportRef.current) {
          await transportRef.current.disconnect();
          transportRef.current = null;
        }
      } catch { /* ignore */ }
    }
  };

  const canFlash =
    status === "ready" || status === "failed" || status === "success"
      ? useManualFirmware
        ? manualFirmwareUrl && manualUrlVerified
        : !!selectedReleaseKey
      : false;
  const loginGateActive = authState === "guest" && !skipLoginGate;
  const canStartFlash = canFlash && authState !== "checking" && !loginGateActive;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl border border-ink/10 bg-paper-dark mb-5">
          <Zap size={24} className="text-ink" />
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink mb-3">
          {tr("在线刷机", "Web Flasher", "Web flasher")}
        </h1>
        <p className="text-ink-light max-w-lg mx-auto">
          {tr("无需安装任何软件，直接在浏览器中为你的 InkSight 设备烧录最新固件。", "No extra software required. Flash the latest firmware directly in your browser.", "Bez dodatnog softvera. Flashaj najnoviji firmware izravno u pregledniku.")}
          <br />
          {tr("基于 WebSerial API，支持 Chrome 和 Edge 浏览器。", "Powered by WebSerial API, works with Chrome and Edge.", "Pokreće ga WebSerial API i radi u Chromeu i Edgeu.")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left - Steps */}
        <div>
          <h2 className="text-lg font-semibold text-ink mb-6 flex items-center gap-2">
            <ListOrdered size={18} />
            {tr("操作步骤", "Steps", "Koraci")}
          </h2>
          <div className="space-y-6">
            {stepsLocalized.map((step, i) => (
              <div key={i} className="flex gap-4 group">
                <div className="flex-shrink-0 flex items-start">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl border border-ink/10 bg-white group-hover:bg-ink group-hover:text-white transition-colors">
                    <step.icon size={18} />
                  </div>
                </div>
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-ink-light font-mono">
                      0{i + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-ink">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-ink-light leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-xl border border-ink/10 bg-paper">
            <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
              <AlertCircle size={14} />
              {tr("注意事项", "Notes", "Napomene")}
            </h3>
            <ul className="space-y-1.5 text-sm text-ink-light">
              <li className="flex items-start gap-2">
                <span className="text-ink mt-0.5">·</span>
                {tr("需要使用 Chrome 89+ 或 Edge 89+ 浏览器", "Use Chrome 89+ or Edge 89+", "Koristi Chrome 89+ ili Edge 89+")}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-ink mt-0.5">·</span>
                {tr("确保 USB 数据线支持数据传输（非仅充电线）", "Use a USB cable that supports data transfer", "Koristi USB kabel koji podržava prijenos podataka")}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-ink mt-0.5">·</span>
                {tr("刷写过程中请勿断开设备连接", "Do not unplug device while flashing", "Ne odspajajte uređaj tijekom flashanja")}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-ink mt-0.5">·</span>
                {tr("刷写完成后设备将自动重启并进入配网模式", "Device reboots and enters provisioning mode after flashing", "Nakon flashanja uređaj se restartira i ulazi u provisioning način")}
              </li>
            </ul>
          </div>
        </div>

        {/* Right - Flasher */}
        <div>
          <h2 className="text-lg font-semibold text-ink mb-6 flex items-center gap-2">
            <Zap size={18} />
            {tr("固件烧录", "Firmware Flash", "Flashanje firmwarea")}
          </h2>

          <div className="rounded-xl border border-ink/10 bg-white p-8 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 text-sm text-ink-light mb-2">
                <CheckCircle2 size={14} className={status === "success" ? "text-green-600" : status === "failed" ? "text-red-500" : status === "flashing" ? "text-amber-500 animate-pulse" : "text-ink-light"} />
                {tr("当前状态", "Status", "Status")}: {flashStatusLabel[status]}
                {status === "flashing" ? ` ${flashProgress}%` : ""}
              </div>
              <p className="text-xs text-ink-light">
                {tr("芯片", "Chip", "Čip")}: {actualChip ?? selectedRelease?.chip_family ?? "ESP32-C3"} &middot; {tr("固件大小", "Size", "Veličina")}:{" "}
                {sizeMB ? `${sizeMB} MB` : tr("未知", "Unknown", "Nepoznato")}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-ink-light mb-2 text-left">
                {tr("固件来源", "Source", "Izvor firmwarea")}
              </label>
              <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
                <Button
                  type="button"
                  variant={useManualFirmware ? "outline" : "default"}
                  onClick={() => {
                    setUseManualFirmware(false);
                    setManualUrlMessage("");
                  }}
                >
                  GitHub Releases
                </Button>
                <Button
                  type="button"
                  variant={useManualFirmware ? "default" : "outline"}
                  onClick={() => {
                    setUseManualFirmware(true);
                    setManualUrlVerified(false);
                  }}
                >
                  {tr("手动 URL", "Manual URL", "Ručni URL")}
                </Button>
              </div>

              {useManualFirmware ? (
                <div>
                  <input
                    className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm text-ink bg-white"
                    placeholder="https://.../inksight-firmware-v1.2.3.bin"
                    value={manualFirmwareUrl}
                    onChange={(e) => {
                      setManualFirmwareUrl(e.target.value.trim());
                      setManualUrlVerified(false);
                      setManualUrlMessage("");
                    }}
                  />
                  <div className="mt-2 flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleVerifyManualUrl}
                      disabled={!manualFirmwareUrl || manualUrlVerifying}
                    >
                      {manualUrlVerifying ? tr("校验中...", "Verifying...", "Provjeravam...") : tr("校验链接", "Verify URL", "Provjeri URL")}
                    </Button>
                  </div>
                  {manualUrlMessage ? (
                    <p
                      className={`mt-2 text-xs text-left ${
                        manualUrlVerified ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {manualUrlMessage}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink-light text-left">
                    {tr("请输入可直接下载的 `.bin` 固件 URL（建议使用 GitHub Releases 资产链接）。", "Enter a direct downloadable .bin firmware URL (GitHub Releases asset link recommended).", "Unesi izravni URL za preuzimanje `.bin` firmwarea (preporučen je GitHub Releases link).")}
                  </p>
                </div>
              ) : (
              <div className="flex gap-2">
                <select
                  className="w-full rounded-xl border border-ink/20 px-3 py-2 text-sm text-ink bg-white"
                  value={selectedReleaseKey}
                  onChange={(e) => setSelectedReleaseKey(e.target.value)}
                  disabled={!releases.length || useManualFirmware}
                >
                  {releases.map((item) => (
                    <option key={buildReleaseKey(item)} value={buildReleaseKey(item)}>
                      {buildReleaseLabel(item)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReloadReleases}
                  disabled={status === "loading_releases"}
                >
                  <RefreshCw size={14} />
                </Button>
              </div>
              )}
              {!useManualFirmware && releaseError ? (
                <p className="mt-2 text-xs text-red-600 text-left">
                  {tr("固件版本加载失败", "Failed to load firmware versions", "Učitavanje firmware verzija nije uspjelo")}: {releaseError}
                </p>
              ) : null}
              {!process.env.NEXT_PUBLIC_FIRMWARE_API_BASE && !useManualFirmware ? (
                <p className="mt-2 text-xs text-ink-light text-left">
                  {tr(
                    "未配置 NEXT_PUBLIC_FIRMWARE_API_BASE 环境变量：GitHub Releases 列表会走当前站点的 /api/firmware/releases。",
                    "NEXT_PUBLIC_FIRMWARE_API_BASE not set. Releases list uses /api/firmware/releases on current site.",
                    "NEXT_PUBLIC_FIRMWARE_API_BASE nije postavljen. Lista verzija koristi /api/firmware/releases na trenutnoj stranici.",
                  )}
                </p>
              ) : null}
            </div>

            {/* Flash button */}
            <div className="mb-6">
              {authState === "checking" ? (
                <div className="mb-3 p-3 rounded-xl border border-ink/10 bg-paper text-sm text-ink-light">
                  {tr("正在检查登录状态...", "Checking auth status...", "Provjeravam status prijave...")}
                </div>
              ) : authState === "guest" && !skipLoginGate ? (
                <div className="mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50 text-left">
                  <p className="text-sm text-amber-800">{tr("建议先登录，再开始刷机", "Sign in first for a smoother flow", "Preporučujemo prijavu prije početka flashanja")}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {tr("登录后可更顺畅完成 刷机 -&gt; 配网 -&gt; 在线配置。", "After sign in: flash -> provisioning -> online configuration.", "Nakon prijave tijek je jednostavniji: flashanje -> provisioning -> online konfiguracija.")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        window.location.href = loginHref;
                      }}
                    >
                      {tr("登录后继续", "Sign in and continue", "Prijavi se i nastavi")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSkipLoginGate(true);
                        addLog(tr("已选择跳过登录，继续刷机", "Continue flashing without sign in", "Nastavljam flashanje bez prijave"));
                      }}
                    >
                      {tr("跳过登录，直接刷机", "Skip sign in", "Preskoči prijavu")}
                    </Button>
                  </div>
                </div>
              ) : authState === "logged_in" ? (
                <div className="mb-3 p-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700">
                  {tr("已登录，可直接完成刷机后的在线配置流程。", "Signed in. You can continue to online config after flashing.", "Prijavljen si. Nakon flashanja možeš odmah nastaviti na online konfiguraciju.")}
                </div>
              ) : null}

              {serialSupported === false ? (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                  <AlertCircle size={16} className="inline mr-2 align-text-bottom" />
                  {tr("你的浏览器不支持 WebSerial API，请使用 Chrome 或 Edge 浏览器。", "Your browser does not support WebSerial API. Please use Chrome or Edge.", "Tvoj preglednik ne podržava WebSerial API. Koristi Chrome ili Edge.")}
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full max-w-xs bg-white text-ink border-ink/20 hover:bg-ink hover:text-white active:bg-ink active:text-white disabled:bg-white disabled:text-ink/50"
                  type="button"
                  onClick={handleFlash}
                  disabled={!canStartFlash || status === "connecting" || status === "flashing"}
                >
                  {status === "connecting"
                    ? tr("正在连接...", "Connecting...", "Spajam...")
                    : status === "flashing"
                    ? tr(`刷写中 ${flashProgress}%`, `Flashing ${flashProgress}%`, `Flashanje ${flashProgress}%`)
                    : tr("刷写固件", "Flash Firmware", "Flashaj firmware")}
                </Button>
              )}

              {status === "flashing" && (
                <div className="mt-3 w-full max-w-xs mx-auto">
                  <div className="h-2 bg-ink/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink transition-all duration-300 rounded-full"
                      style={{ width: `${flashProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-light mt-1">{flashProgress}%</p>
                </div>
              )}
            </div>

            {/* Post-flash info */}
            {status === "success" ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-5 text-left">
                <h3 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  {tr("刷写成功 — 下一步配网", "Flashed Successfully - Next: Provisioning", "Flashanje uspješno — sljedeće: provisioning")}
                </h3>
                <ol className="space-y-2 text-sm text-green-700 list-decimal list-inside">
                  <li>{tr("断开 USB，给设备上电", "Disconnect USB and power on the device", "Odspoji USB i uključi uređaj")}</li>
                  <li>{tr("在手机/电脑 WiFi 列表中找到 InkSight-XXXX 热点并连接", "Find the InkSight-XXXX hotspot in your WiFi list and connect", "Na listi WiFi mreža pronađi hotspot InkSight-XXXX i poveži se")}</li>
                  <li>{tr("浏览器会自动弹出配网页面（如未弹出，手动访问 192.168.4.1）", "The browser should open the provisioning page automatically. If not, visit 192.168.4.1 manually.", "Preglednik bi trebao automatski otvoriti provisioning stranicu. Ako ne, ručno otvori 192.168.4.1.")}</li>
                  <li>{tr("在配网页面输入 WiFi 和服务器地址后保存", "Enter WiFi and server address on the provisioning page, then save", "Na provisioning stranici unesi WiFi i adresu servera pa spremi")}</li>
                  <li>{tr("保存成功后，配网页面底部会显示“打开配置页面”链接，点击即可进行个性化配置", "After saving, the provisioning page shows an Open Configuration Page link for personalized setup", "Nakon spremanja, na dnu provisioning stranice pojavit će se poveznica Otvori konfiguraciju za daljnje postavke")}</li>
                </ol>
                {status === "success" ? (
                  <div className="mt-4">
                    <Button size="sm" onClick={() => window.open(withLocalePath(locale, "/config"), "_blank")}>
                      {tr("前往配置页面", "Open Configuration Page", "Otvori konfiguraciju")}
                    </Button>
                    <p className="mt-2 text-xs text-green-600">{tr("配置页面会自动检测设备上线", "Configuration page will detect device online status automatically.", "Konfiguracijska stranica automatski će prepoznati da je uređaj online.")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Console Log */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Terminal size={14} />
              {tr("控制台日志", "Console Logs", "Konzolni logovi")}
            </h3>
            <div className="ink-strong-select rounded-xl border border-ink/10 bg-ink text-green-400 font-mono text-xs p-4 h-48 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className="py-0.5 leading-relaxed">
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Post-flash guide dialog */}
      {showPostFlashGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPostFlashGuide(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 animate-fade-in">
            <div className="rounded-xl border border-ink/10 bg-white p-6 shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-green-600" />
                  <h2 className="text-lg font-semibold text-ink">{tr("刷写成功", "Flash Completed", "Flashanje dovršeno")}</h2>
                </div>
                <button onClick={() => setShowPostFlashGuide(false)} className="p-1 text-ink-light hover:text-ink">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-ink-light mb-4">{tr("固件已烧录成功，请按以下步骤完成配网：", "Firmware flashed successfully. Follow the steps below to finish provisioning:", "Firmware je uspješno flashan. Slijedi ove korake za dovršetak provisioninga:")}</p>
              <ol className="space-y-3 text-sm text-ink">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs flex items-center justify-center font-medium">1</span>
                  <span>{tr("断开 USB 数据线，给设备上电", "Disconnect the USB cable and power on the device", "Odspoji USB kabel i uključi uređaj")}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs flex items-center justify-center font-medium">2</span>
                  <span>{tr("在 WiFi 列表中找到 InkSight-XXXX 热点并连接", "Find the InkSight-XXXX hotspot in the WiFi list and connect", "Na listi WiFi mreža pronađi hotspot InkSight-XXXX i poveži se")}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs flex items-center justify-center font-medium">3</span>
                  <span>{tr("浏览器自动弹出配网页面，若未弹出则手动访问 192.168.4.1", "The browser opens the provisioning page automatically. If not, visit 192.168.4.1 manually.", "Preglednik će automatski otvoriti provisioning stranicu. Ako ne, ručno otvori 192.168.4.1.")}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs flex items-center justify-center font-medium">4</span>
                  <span>{tr("输入家庭 WiFi 和服务器地址，保存后设备自动重启联网", "Enter home WiFi and server address, then save to reboot and connect", "Unesi kućni WiFi i adresu servera, zatim spremi za restart i povezivanje")}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs flex items-center justify-center font-medium">5</span>
                  <span>{tr("保存成功后，配网页面底部会显示“打开配置页面”链接，点击即可进行个性化配置", "After saving, the provisioning page shows an Open Configuration Page link for personalized setup", "Nakon spremanja, provisioning stranica prikazat će poveznicu Otvori konfiguraciju za daljnje postavke")}</span>
                </li>
              </ol>
              <div className="mt-4">
                <Button size="sm" onClick={() => window.open("/config", "_blank")}>
                  {tr("前往配置页面", "Open Configuration Page", "Otvori konfiguraciju")}
                </Button>
                <p className="mt-2 text-xs text-ink-light">{tr("配置页面会自动检测设备上线", "Configuration page will detect device online status automatically.", "Konfiguracijska stranica automatski će prepoznati da je uređaj online.")}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
