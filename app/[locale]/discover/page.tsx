"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Search, Download, Image as ImageIcon, Upload, Loader2, Check } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { localeFromPathname, pickByLocale } from "@/lib/i18n";

const categoryOptions = [
  { value: "all", zh: "全部", en: "All", hr: "Sve" },
  { value: "productivity", zh: "效率", en: "Productivity", hr: "Produktivnost" },
  { value: "learning", zh: "学习", en: "Learning", hr: "Učenje" },
  { value: "life", zh: "生活", en: "Life", hr: "Život" },
  { value: "fun", zh: "趣味", en: "Fun", hr: "Zabava" },
  { value: "geek", zh: "极客", en: "Geek", hr: "Geek" },
];

const publishCategoryOptions = categoryOptions.filter((item) => item.value !== "all");

// Shared mode data returned by the community plaza API.
interface SharedMode {
  id: number;
  mode_id: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  created_at: string;
  author: string;
}

// Custom mode data returned for the current user.
interface CustomMode {
  mode_id: string;
  display_name: string;
  description: string;
  source?: string;
}

// Device records used for install and publish flows.
interface Device {
  mac: string;
  nickname: string;
  role: string;
  status: string;
}

interface InstalledPlugin {
  plugin_id: string;
  version: string;
  custom_mode_id: string;
  manifest?: {
    name?: string;
    signature?: string;
    permissions_obj?: {
      allowed_domains?: string[];
    };
  };
  installed_at?: string;
  updated_at?: string;
}

interface PluginEvent {
  plugin_id: string;
  event_type: string;
  version: string;
  created_at: string;
}

export default function DiscoverPage() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname || "/");
  const tr = useMemo(
    () => (zh: string, en: string, hr = en) => pickByLocale(locale, { zh, en, hr }),
    [locale],
  );
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingPlugin, setIsUploadingPlugin] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  
  // Remote data state.
  const [modes, setModes] = useState<SharedMode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installingModes, setInstallingModes] = useState<Set<number>>(new Set());
  const [installedModes, setInstalledModes] = useState<Set<number>>(new Set());
  
  // Custom modes owned by the current user.
  const [customModes, setCustomModes] = useState<CustomMode[]>([]);
  const [isLoadingCustomModes, setIsLoadingCustomModes] = useState(false);
  
  // Device list for install and publish actions.
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [installTargetMac, setInstallTargetMac] = useState("");
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [removingPluginId, setRemovingPluginId] = useState<string | null>(null);
  const [pluginEvents, setPluginEvents] = useState<PluginEvent[]>([]);
  
  // Publish form state.
  const [publishForm, setPublishForm] = useState({
    source_custom_mode_id: "",
    name: "",
    description: "",
    category: "",
    mac: "",
  });
  const [uploadForm, setUploadForm] = useState({
    mac: "",
    fileName: "",
    fileContent: "",
    fileBase64: "",
  });
  
  // Device picker used when installing a mode.
  const [installDeviceModal, setInstallDeviceModal] = useState<{
    open: boolean;
    modeId: number | null;
  }>({ open: false, modeId: null });

  // Fetch community modes.
  const fetchModes = useCallback(async (category: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (category && category !== "all") {
        params.append("category", category);
      }
      params.append("page", "1");
      params.append("limit", "100");

      const response = await fetch(`/api/discover/modes?${params.toString()}`);

      if (!response.ok) {
        throw new Error(tr(`获取模式列表失败: ${response.status}`, `Failed to fetch modes: ${response.status}`, `Dohvat modova nije uspio: ${response.status}`));
      }

      const data = await response.json();
      setModes(data.modes || []);
    } catch (err) {
      console.error("Failed to fetch modes:", err);
      setError(err instanceof Error ? err.message : tr("获取模式列表失败", "Failed to fetch modes", "Dohvat modova nije uspio"));
      setModes([]);
    } finally {
      setIsLoading(false);
    }
  }, [tr]);

  // Fetch the user's devices.
  const fetchDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const response = await fetch("/api/user/devices", {
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error(tr(`获取设备列表失败: ${response.status}`, `Failed to fetch devices: ${response.status}`, `Dohvat uređaja nije uspio: ${response.status}`));
      }

      const data = await response.json();
      const deviceList = data.devices || [];
      setDevices(deviceList);
      if (deviceList.length > 0) {
        setInstallTargetMac((prev) => prev || deviceList[0].mac);
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
      setDevices([]);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [tr]);

  const fetchInstalledModes = useCallback(async (mac: string) => {
    if (!mac) return;
    try {
      const params = new URLSearchParams({ mac });
      const response = await fetch(`/api/discover/modes/installed?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      const ids = new Set<number>(
        (data.installed || [])
          .map((it: { shared_mode_id?: number }) => Number(it?.shared_mode_id))
          .filter((n: number) => Number.isFinite(n))
      );
      setInstalledModes(ids);
    } catch {
      // no-op: keep UI usable even if lookup fails
    }
  }, []);

  const fetchInstalledPlugins = useCallback(async (mac: string) => {
    if (!mac) return;
    try {
      const params = new URLSearchParams({ mac });
      const response = await fetch(`/api/discover/plugins/installed?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      setInstalledPlugins(data.plugins || []);
    } catch {
      setInstalledPlugins([]);
    }
  }, []);

  const fetchPluginEvents = useCallback(async (mac: string) => {
    if (!mac) return;
    try {
      const params = new URLSearchParams({ mac, limit: "10" });
      const response = await fetch(`/api/discover/plugins/events?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      setPluginEvents(data.events || []);
    } catch {
      setPluginEvents([]);
    }
  }, []);

  // Fetch custom modes, optionally filtered by device.
  const fetchCustomModes = useCallback(async (mac?: string) => {
    setIsLoadingCustomModes(true);
    try {
      const params = new URLSearchParams();
      if (mac) {
        params.append("mac", mac);
      }

      const response = await fetch(`/api/modes?${params.toString()}`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error(tr(`获取自定义模式失败: ${response.status}`, `Failed to fetch custom modes: ${response.status}`, `Dohvat prilagođenih modova nije uspio: ${response.status}`));
      }

      const data = await response.json();
      // Keep only custom modes created by the user.
      const custom = (data.modes || []).filter(
        (mode: CustomMode) => mode.source === "custom"
      );
      setCustomModes(custom);
    } catch (err) {
      console.error("Failed to fetch custom modes:", err);
      setCustomModes([]);
    } finally {
      setIsLoadingCustomModes(false);
    }
  }, [tr]);

  // Refetch when the selected category changes.
  useEffect(() => {
    fetchModes(selectedCategory);
  }, [selectedCategory, fetchModes]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (installTargetMac) {
      fetchInstalledModes(installTargetMac);
      fetchInstalledPlugins(installTargetMac);
      fetchPluginEvents(installTargetMac);
    }
  }, [installTargetMac, fetchInstalledModes, fetchInstalledPlugins, fetchPluginEvents]);

  // Load devices when the publish dialog opens.
  useEffect(() => {
    if (isPublishModalOpen) {
      fetchDevices();
    }
  }, [isPublishModalOpen, fetchDevices]);

  useEffect(() => {
    if (isUploadModalOpen) {
      fetchDevices();
    }
  }, [isUploadModalOpen, fetchDevices]);

  // Load custom modes for the selected device.
  useEffect(() => {
    if (isPublishModalOpen && publishForm.mac) {
      fetchCustomModes(publishForm.mac);
    } else if (isPublishModalOpen && !publishForm.mac) {
      setCustomModes([]);
    }
  }, [isPublishModalOpen, publishForm.mac, fetchCustomModes]);

  // Open the install dialog for the selected mode.
  const handleInstallClick = (modeId: number) => {
    if (installingModes.has(modeId) || installedModes.has(modeId)) {
      return;
    }
    setInstallDeviceModal({ open: true, modeId });
    if (devices.length === 0) {
      fetchDevices();
    }
  };

  // Install a shared mode onto one of the user's devices.
  const handleInstall = async (modeId: number, mac: string) => {
    if (installingModes.has(modeId) || installedModes.has(modeId)) {
      return;
    }

    setInstallingModes((prev) => new Set(prev).add(modeId));
    setInstallDeviceModal({ open: false, modeId: null });

    try {
      const response = await fetch(`/api/discover/modes/${modeId}/install`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ mac }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || tr(`安装失败: ${response.status}`, `Install failed: ${response.status}`, `Instalacija nije uspjela: ${response.status}`));
      }

      const data = await response.json();
      
      // Mark the mode as installed in the local UI state.
      setInstalledModes((prev) => new Set(prev).add(modeId));
      
      // Show a success toast.
      setToastMessage(tr("成功添加至我的模式", "Added to My Modes", "Dodano u Moje Modove"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      
      console.log("Mode installed:", data.custom_mode_id);
      if (installTargetMac) {
        fetchInstalledModes(installTargetMac);
      }
    } catch (err) {
      console.error("Install failed:", err);
      setToastMessage(err instanceof Error ? err.message : tr("安装失败", "Install failed", "Instalacija nije uspjela"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setInstallingModes((prev) => {
        const next = new Set(prev);
        next.delete(modeId);
        return next;
      });
    }
  };

  // Publish a custom mode to the community plaza.
  const handlePublish = async () => {
    if (!publishForm.source_custom_mode_id || !publishForm.name || !publishForm.category || !publishForm.mac) {
      setToastMessage(tr("请填写所有必填项，包括选择设备", "Please complete all required fields, including the target device", "Ispuni sva obavezna polja, uključujući ciljni uređaj."));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    const payload = {
      source_custom_mode_id: publishForm.source_custom_mode_id,
      name: publishForm.name,
      description: publishForm.description,
      category: publishForm.category,
      mac: publishForm.mac,
      // The backend generates the preview image automatically, so no thumbnail is needed here.
    };

    setIsPublishing(true);
    setPublishStatus(tr("正在准备发布...", "Preparing your mode for publishing...", "Pripremam mod za objavu..."));
    
    try {
      // If needed, let the user know preview generation may take a while.
      const selectedMode = customModes.find(m => m.mode_id === publishForm.source_custom_mode_id);
      if (selectedMode) {
        setPublishStatus(tr("正在生成预览图片，请稍候...", "Generating preview image, please wait...", "Generiram preview sliku, pričekaj..."));
      }

      // Allow a longer timeout because image generation can be slower.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch("/api/discover/modes/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || tr(`发布失败: ${response.status}`, `Publish failed: ${response.status}`, `Objava nije uspjela: ${response.status}`);
        
        // Replace timeout errors with a more actionable message.
        if (response.status === 408) {
          throw new Error(tr("图片生成超时，请检查图片生成 API 配置或稍后重试", "Image generation timed out. Please check your image API configuration or try again later.", "Generiranje slike je isteklo. Provjeri konfiguraciju image API-ja ili pokušaj kasnije."));
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Published mode:", data);
      
      setPublishStatus(tr("发布成功！", "Published successfully!", "Objavljeno uspješno!"));
      setIsPublishing(false);
      setIsPublishModalOpen(false);
      
      // Reset the form.
      setPublishForm({
        source_custom_mode_id: "",
        name: "",
        description: "",
        category: "",
        mac: "",
      });

      // Refresh the grid after publishing.
      await fetchModes(selectedCategory);
      
      // Show a success toast.
      setToastMessage(tr("发布成功！你的模式已分享到广场", "Published successfully! Your mode is now visible in the plaza.", "Objava je uspjela! Tvoj mod je sada vidljiv u galeriji."));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      console.error("Publish failed:", error);
      setIsPublishing(false);
      setPublishStatus("");
      
      // Handle request timeouts separately so the user gets a clearer hint.
      if (error instanceof Error && error.name === "AbortError") {
        setToastMessage(tr("请求超时，图片生成可能需要更长时间。请稍后重试。", "Request timed out. Image generation may need more time. Please try again later.", "Zahtjev je istekao. Generiranje slike možda treba više vremena. Pokušaj kasnije."));
      } else {
        setToastMessage(error instanceof Error ? error.message : tr("发布失败", "Publish failed", "Objava nije uspjela"));
      }
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const handlePluginFileSelected = async (file: File | null) => {
    if (!file) return;
    try {
      const isZip = file.name.toLowerCase().endsWith(".zip");
      if (isZip) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        setUploadForm((prev) => ({
          ...prev,
          fileName: file.name,
          fileContent: "",
          fileBase64: b64,
        }));
      } else {
        const text = await file.text();
        JSON.parse(text);
        const b64 = btoa(unescape(encodeURIComponent(text)));
        setUploadForm((prev) => ({
          ...prev,
          fileName: file.name,
          fileContent: text,
          fileBase64: b64,
        }));
      }
    } catch {
      setToastMessage(tr("文件无效，请上传 JSON 或 ZIP 插件包", "Invalid file. Upload a JSON or ZIP plugin package.", "Neispravna datoteka. Učitaj JSON ili ZIP plugin paket."));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const handleInstallLocalPlugin = async () => {
    if (!uploadForm.mac || !uploadForm.fileBase64) {
      setToastMessage(tr("请先选择设备和插件文件", "Please choose a device and plugin file first", "Prvo odaberi uređaj i plugin datoteku"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    setIsUploadingPlugin(true);
    try {
      const response = await fetch("/api/discover/plugins/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          mac: uploadForm.mac,
          plugin_base64: uploadForm.fileBase64,
          plugin_filename: uploadForm.fileName,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || tr("安装失败", "Install failed", "Instalacija nije uspjela"));
      }

      setIsUploadModalOpen(false);
      setUploadForm({ mac: "", fileName: "", fileContent: "", fileBase64: "" });
      const action = String(data?.action || "installed");
      if (action === "updated") {
        setToastMessage(tr("插件已更新到新版本", "Plugin updated to a newer version", "Plugin je ažuriran na noviju verziju"));
      } else if (action === "reinstalled") {
        setToastMessage(tr("插件已重新安装（同版本）", "Plugin reinstalled (same version)", "Plugin je ponovno instaliran (ista verzija)"));
      } else {
        setToastMessage(tr("插件安装成功，已加入你的模式", "Plugin installed and added to your modes", "Plugin je instaliran i dodan u tvoje modove"));
      }
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      if (uploadForm.mac) {
        fetchInstalledPlugins(uploadForm.mac);
        fetchPluginEvents(uploadForm.mac);
      }
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : tr("安装失败", "Install failed", "Instalacija nije uspjela"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setIsUploadingPlugin(false);
    }
  };

  const handleDownloadPluginTemplate = () => {
    const template = {
      manifest: {
        plugin_id: "MY_PLUGIN",
        version: "1.0.0",
        name: "My Plugin",
      },
      mode: {
        mode_id: "MY_PLUGIN_MODE",
        display_name: "My Plugin Mode",
        cacheable: true,
        content: {
          type: "static",
          fallback: {
            text: "Hello from plugin",
          },
        },
        layout: {
          body: [
            {
              type: "centered_text",
              field: "text",
              font: "noto_serif_light",
              font_size: 20,
            },
          ],
        },
      },
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inksight-plugin-template.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSelectedModeAsPlugin = async () => {
    if (!publishForm.mac || !publishForm.source_custom_mode_id) {
      setToastMessage(tr("请先选择设备和模式", "Please select a device and mode first", "Prvo odaberi uređaj i mod"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }
    try {
      const params = new URLSearchParams({
        mac: publishForm.mac,
        mode_id: publishForm.source_custom_mode_id,
        version: "1.0.0",
      });
      const res = await fetch(`/api/discover/plugins/export?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tr("导出失败", "Export failed", "Izvoz nije uspio"));
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const filenameMatch = cd.match(/filename=\"?([^"]+)\"?/i);
      const filename = filenameMatch?.[1] || `${publishForm.source_custom_mode_id.toLowerCase()}-1.0.0.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setToastMessage(tr("插件包已导出", "Plugin package exported", "Plugin paket je izvezen"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : tr("导出失败", "Export failed", "Izvoz nije uspio"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const handleUninstallPlugin = async (pluginId: string) => {
    if (!installTargetMac || !pluginId || removingPluginId) return;
    setRemovingPluginId(pluginId);
    try {
      const params = new URLSearchParams({ mac: installTargetMac });
      const res = await fetch(`/api/discover/plugins/${encodeURIComponent(pluginId)}?${params.toString()}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || tr("卸载失败", "Uninstall failed", "Deinstalacija nije uspjela"));
      }
      await fetchInstalledPlugins(installTargetMac);
      await fetchPluginEvents(installTargetMac);
      setToastMessage(tr("插件已卸载", "Plugin uninstalled", "Plugin je deinstaliran"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : tr("卸载失败", "Uninstall failed", "Deinstalacija nije uspjela"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setRemovingPluginId(null);
    }
  };

  const eventLabel = (eventType: string) => {
    if (eventType === "updated") return tr("已更新", "Updated", "Ažurirano");
    if (eventType === "reinstalled") return tr("已重装", "Reinstalled", "Ponovno instalirano");
    if (eventType === "uninstalled") return tr("已卸载", "Uninstalled", "Deinstalirano");
    return tr("已安装", "Installed", "Instalirano");
  };

  const pluginSecurityMeta = (plugin: InstalledPlugin) => {
    const signature = (plugin.manifest?.signature || "").trim();
    const allowedDomains = plugin.manifest?.permissions_obj?.allowed_domains;
    const hasDomainAllowlist = Array.isArray(allowedDomains) && allowedDomains.length > 0;
    return {
      signed: !!signature,
      restricted: hasDomainAllowlist,
      domainCount: hasDomainAllowlist ? allowedDomains.length : 0,
    };
  };

  // Filter modes client-side by search query.
  const filteredModes = modes.filter((mode) => {
    const matchesSearch =
      searchQuery === "" ||
      mode.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mode.description && mode.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      mode.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(0,0,0,0.06),transparent_40%),linear-gradient(180deg,#f8f8f8_0%,#f3f3f3_100%)]">
      {/* Hero header */}
      <section className="border-b border-black/10 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          {/* Title block */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-4">
              <Sparkles size={28} className="text-ink" />
              <h1 className="font-serif text-4xl md:text-5xl font-bold text-ink">
                {tr("探索社区模式", "Explore Community Modes", "Istraži Modove Zajednice")}
              </h1>
            </div>
            <p className="text-base md:text-lg text-ink-light mt-4 max-w-2xl mx-auto">
              {tr("发现、分享并安装由 InkSight 社区创造的个性化墨水屏应用。", "Discover, share, and install personalized e-ink modes created by the InkSight community.", "Otkrij, podijeli i instaliraj personalizirane e-ink modove koje je stvorila InkSight zajednica.")}
            </p>
          </div>

          {/* Search field */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-light"
              />
              <input
                type="text"
                placeholder={tr("搜索模式、作者或描述...", "Search modes, authors, or descriptions...", "Pretraži modove, autore ili opise...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-300 rounded-xl text-ink placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
              />
            </div>
          </div>

          {/* Category pills and publish action */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/70 p-4 shadow-[0_20px_50px_-35px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="flex flex-wrap justify-center gap-3 flex-1">
              {categoryOptions.map((category) => (
                <button
                  key={category.value}
                  onClick={() => setSelectedCategory(category.value)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedCategory === category.value
                      ? "bg-ink text-white shadow-[2px_2px_0_0_#000000]"
                      : "bg-white text-ink hover:bg-gray-50/80 border border-gray-200 hover:border-ink/25 hover:shadow-md"
                  }`}
                >
                  {pickByLocale(locale, { zh: category.zh, en: category.en, hr: category.hr })}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-ink-light">{tr("设备", "Device", "Uređaj")}</label>
              <select
                value={installTargetMac}
                onChange={(e) => setInstallTargetMac(e.target.value)}
                className="px-2 py-1 text-sm bg-white border border-gray-300 rounded-xl text-ink"
              >
                <option value="">{tr("选择设备", "Select device", "Odaberi uređaj")}</option>
                {devices.map((device) => (
                  <option key={device.mac} value={device.mac}>
                    {device.nickname || device.mac}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPublishModalOpen(true)}
                className="bg-ink text-white rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-2 hover:bg-ink/90 transition-colors"
              >
                <Upload size={16} />
                {tr("发布模式", "Publish Mode", "Objavi Mod")}
              </button>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-white text-ink rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-2 border border-gray-300 hover:border-black transition-colors"
              >
                <Upload size={16} />
                {tr("上传插件", "Upload Plugin", "Učitaj Plugin")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Mode grid */}
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        {installTargetMac && (
          <div className="mb-8 rounded-2xl border border-black/10 bg-white/85 p-4 shadow-[0_20px_50px_-35px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-ink">{tr("我的插件", "My Plugins", "Moji Plugini")}</h2>
              <span className="text-xs text-ink-light">{tr("当前设备", "Current device", "Trenutni uređaj")}: {installTargetMac}</span>
            </div>
            {installedPlugins.length > 0 ? (
              <div className="space-y-2">
                {installedPlugins.map((plugin) => (
                  <div key={plugin.plugin_id} className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {plugin.manifest?.name || plugin.plugin_id}
                      </div>
                      <div className="text-xs text-ink-light">
                        {plugin.plugin_id} · v{plugin.version}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {(() => {
                          const sec = pluginSecurityMeta(plugin);
                          return (
                            <>
                              <span
                                className={`px-1.5 py-0.5 rounded-xl text-[10px] border ${
                                  sec.signed
                                    ? "border-gray-300 text-ink bg-white"
                                    : "border-gray-200 text-ink-light bg-gray-50"
                                }`}
                              >
                                {sec.signed
                                  ? tr("已签名", "Signed", "Potpisano")
                                  : tr("未签名", "Unsigned", "Bez potpisa")}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded-xl text-[10px] border ${
                                  sec.restricted
                                    ? "border-gray-300 text-ink bg-white"
                                    : "border-gray-200 text-ink-light bg-gray-50"
                                }`}
                              >
                                {sec.restricted
                                  ? tr(`域名白名单(${sec.domainCount})`, `Domain allowlist (${sec.domainCount})`, `Dozvoljene domene (${sec.domainCount})`)
                                  : tr("无域名限制", "Open domain", "Otvorene domene")}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleUninstallPlugin(plugin.plugin_id)}
                      disabled={removingPluginId === plugin.plugin_id}
                      className="bg-white text-black border border-black hover:bg-black hover:text-white transition-colors"
                    >
                      {removingPluginId === plugin.plugin_id ? tr("处理中...", "Working...", "Obrađujem...") : tr("卸载", "Uninstall", "Deinstaliraj")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-ink-light border border-dashed border-gray-300 rounded-xl px-3 py-3">
                {tr("此设备暂时没有已安装插件。", "No plugins installed on this device yet.", "Na ovom uređaju još nema instaliranih plugina.")}
              </div>
            )}
            {pluginEvents.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="text-xs uppercase tracking-wide text-ink-light mb-2">
                  {tr("最近操作", "Recent Activity", "Nedavne aktivnosti")}
                </div>
                <div className="space-y-1">
                  {pluginEvents.slice(0, 5).map((ev, idx) => (
                    <div key={`${ev.plugin_id}-${ev.created_at}-${idx}`} className="text-xs text-ink-light">
                      {eventLabel(ev.event_type)} · {ev.plugin_id} · v{ev.version}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="text-ink-light animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-ink-light mb-2">{error}</p>
            <button
              onClick={() => fetchModes(selectedCategory)}
              className="text-sm text-ink underline hover:text-ink/70"
            >
              {tr("重试", "Retry", "Pokušaj Ponovno")}
            </button>
          </div>
        ) : filteredModes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredModes.map((mode) => {
              const isInstalling = installingModes.has(mode.id);
              const isInstalled = installedModes.has(mode.id);
              
              return (
                <Card
                  key={mode.id}
                  className="group overflow-hidden rounded-2xl border border-black/10 bg-white/90 shadow-[0_18px_45px_-35px_rgba(0,0,0,0.65)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_24px_45px_-24px_rgba(0,0,0,0.4)] flex flex-col"
                >
                  <CardContent className="pt-8 px-6 pb-6 flex flex-col flex-1">
                    {/* Card header: name, author, and category */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-ink mb-1">
                            {mode.name}
                          </h3>
                          <p className="text-sm text-ink-light">{mode.author}</p>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-medium text-ink bg-paper-dark rounded-xl whitespace-nowrap ml-3">
                          {pickByLocale(locale, {
                            en: categoryOptions.find((category) => category.value === mode.category)?.en || mode.category,
                            hr: categoryOptions.find((category) => category.value === mode.category)?.hr || mode.category,
                            zh: categoryOptions.find((category) => category.value === mode.category)?.zh || mode.category,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Thumbnail */}
                    <div className="w-full aspect-4/3 mb-4 border border-gray-300 bg-white rounded-xl overflow-hidden relative">
                      {mode.thumbnail_url ? (
                        <Image
                          src={mode.thumbnail_url}
                          alt={mode.name}
                          fill
                          className="object-contain bg-white"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full border border-dashed border-gray-300 bg-white rounded-xl flex items-center justify-center flex-col">
                          <ImageIcon size={32} className="text-gray-400 mb-2" />
                          <span className="text-xs text-gray-400">{tr("缩略图占位", "Thumbnail placeholder", "Mjesto za thumbnail")}</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-700 mb-4 flex-1 line-clamp-2 font-serif leading-relaxed">
                      {mode.description || tr("暂无描述", "No description yet", "Još nema opisa")}
                    </p>

                    {/* Card actions */}
                    <div className="mt-auto pt-4 border-t border-ink/5">
                      <Button
                        variant="outline"
                        onClick={() => handleInstallClick(mode.id)}
                        disabled={isInstalling || isInstalled}
                        className={`w-full transition-colors ${
                          isInstalled
                            ? "bg-gray-100 text-gray-600 border-gray-300 cursor-not-allowed"
                            : "bg-white text-black border border-black hover:bg-black hover:text-white"
                        }`}
                      >
                        {isInstalling ? (
                          <>
                            <Loader2 size={16} className="mr-2 animate-spin" />
                            {tr("获取中...", "Installing...", "Instaliram...")}
                          </>
                        ) : isInstalled ? (
                          <>
                            <Check size={16} className="mr-2" />
                            {tr("已获取", "Installed", "Instalirano")}
                          </>
                        ) : (
                          <>
                            <Download size={16} className="mr-2" />
                            {tr("获取", "Install", "Instaliraj")}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-ink-light">{tr("暂无匹配的模式", "No matching modes yet", "Nema odgovarajućih modova")}</p>
          </div>
        )}
      </section>

      {/* Publish dialog */}
      <Dialog open={isPublishModalOpen} onClose={() => setIsPublishModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setIsPublishModalOpen(false)}>
            <DialogTitle>{tr("发布模式到广场", "Publish a Mode to the Plaza", "Objavi Mod u Galeriju")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Device select */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("选择设备", "Select Device", "Odaberi Uređaj")} <span className="text-red-500">*</span>
              </label>
              {isLoadingDevices ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl flex items-center justify-center">
                  <Loader2 size={16} className="text-ink-light animate-spin" />
                  <span className="ml-2 text-sm text-ink-light">{tr("加载中...", "Loading...", "Učitavanje...")}</span>
                </div>
              ) : devices.length === 0 ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink-light text-sm">
                  {tr("暂无设备，请先绑定设备", "No devices yet. Please bind a device first.", "Još nema uređaja. Najprije poveži uređaj.")}
                </div>
              ) : (
                <select
                  value={publishForm.mac}
                  onChange={(e) => {
                    setPublishForm({ ...publishForm, mac: e.target.value, source_custom_mode_id: "" });
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink focus:outline-none focus:border-black transition-colors"
                >
                  <option value="">{tr("请选择设备", "Choose a device", "Odaberi uređaj")}</option>
                  {devices.map((device) => (
                    <option key={device.mac} value={device.mac}>
                      {device.nickname || device.mac} ({device.mac})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Mode select */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("选择模式", "Select Mode", "Odaberi Mod")} <span className="text-red-500">*</span>
              </label>
              {isLoadingCustomModes ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl flex items-center justify-center">
                  <Loader2 size={16} className="text-ink-light animate-spin" />
                  <span className="ml-2 text-sm text-ink-light">{tr("加载中...", "Loading...", "Učitavanje...")}</span>
                </div>
              ) : customModes.length === 0 ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink-light text-sm">
                  {tr("暂无自定义模式，请先创建自定义模式", "No custom modes yet. Please create one first.", "Još nema prilagođenih modova. Najprije kreiraj jedan.")}
                </div>
              ) : (
                <select
                  value={publishForm.source_custom_mode_id}
                  onChange={(e) => {
                    const selectedMode = customModes.find(
                      (m) => m.mode_id === e.target.value
                    );
                    setPublishForm({
                      ...publishForm,
                      source_custom_mode_id: e.target.value,
                      name: selectedMode?.display_name || publishForm.name,
                      description: selectedMode?.description || publishForm.description,
                    });
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink focus:outline-none focus:border-black transition-colors"
                >
                  <option value="">{tr("请选择要分享的模式", "Choose a mode to share", "Odaberi mod za dijeljenje")}</option>
                  {customModes.map((mode) => (
                    <option key={mode.mode_id} value={mode.mode_id}>
                      {mode.mode_id}: {mode.display_name}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleExportSelectedModeAsPlugin}
                  className="text-xs text-ink underline hover:text-ink/70"
                >
                  {tr("将所选模式导出为插件 ZIP", "Export selected mode as plugin ZIP", "Izvezi odabrani mod kao plugin ZIP")}
                </button>
              </div>
            </div>

            {/* Display name */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("展示名称", "Display Name", "Naziv za Prikaz")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={publishForm.name}
                onChange={(e) =>
                  setPublishForm({ ...publishForm, name: e.target.value })
                }
                placeholder={tr("为你的模式起个名字", "Give your mode a memorable name", "Daj modu ime koje se pamti")}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("模式描述", "Description", "Opis")}
              </label>
              <textarea
                value={publishForm.description}
                onChange={(e) =>
                  setPublishForm({ ...publishForm, description: e.target.value })
                }
                placeholder={tr("描述这个模式的特色和用途...", "Describe what this mode is for and what makes it special...", "Opiši čemu mod služi i što ga čini posebnim...")}
                rows={4}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors font-serif leading-relaxed resize-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("分类", "Category", "Kategorija")} <span className="text-red-500">*</span>
              </label>
              <select
                value={publishForm.category}
                onChange={(e) =>
                  setPublishForm({ ...publishForm, category: e.target.value })
                }
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink focus:outline-none focus:border-black transition-colors"
              >
                <option value="">{tr("请选择分类", "Choose a category", "Odaberi kategoriju")}</option>
                {publishCategoryOptions.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {pickByLocale(locale, { zh: cat.zh, en: cat.en, hr: cat.hr })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dialog actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-ink/10">
            <Button
              variant="outline"
              onClick={() => setIsPublishModalOpen(false)}
              disabled={isPublishing}
              className="bg-white text-black border border-black hover:bg-black hover:text-white transition-colors"
            >
              {tr("取消", "Cancel", "Odustani")}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={
                isPublishing ||
                !publishForm.source_custom_mode_id ||
                !publishForm.name ||
                !publishForm.category
              }
              className="bg-ink text-white hover:bg-ink/90 transition-colors"
            >
              {isPublishing ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {publishStatus || tr("发布中...", "Publishing...", "Objavljujem...")}
                </>
              ) : (
                tr("确认发布", "Confirm Publish", "Potvrdi Objavu")
              )}
            </Button>
            {isPublishing && publishStatus && (
              <div className="mt-3 text-center">
                <p className="text-xs text-ink-light">
                  {publishStatus}
                </p>
                {publishStatus.includes("图片生成") || publishStatus.includes("preview image") ? (
                  <p className="text-xs text-ink-light mt-1">
                    {tr("正在等待图片生成完成，这可能需要几秒到几十秒，请耐心等待...", "Waiting for image generation. This may take a few seconds to tens of seconds. Please hang tight...", "Čeka se završetak generiranja slike. To može trajati od nekoliko sekundi do nekoliko desetaka sekundi.")}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload plugin dialog */}
      <Dialog open={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setIsUploadModalOpen(false)}>
            <DialogTitle>{tr("上传并安装插件", "Upload and Install Plugin", "Učitaj i Instaliraj Plugin")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("选择设备", "Select Device", "Odaberi Uređaj")} <span className="text-red-500">*</span>
              </label>
              <select
                value={uploadForm.mac}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, mac: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink focus:outline-none focus:border-black transition-colors"
              >
                <option value="">{tr("请选择设备", "Choose a device", "Odaberi uređaj")}</option>
                {devices.map((device) => (
                  <option key={device.mac} value={device.mac}>
                    {device.nickname || device.mac} ({device.mac})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {tr("插件文件 (.json)", "Plugin File (.json)", "Plugin datoteka (.json)")} <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="application/json,.json,application/zip,.zip"
                onChange={(e) => handlePluginFileSelected(e.target.files?.[0] || null)}
                className="w-full text-sm text-ink"
              />
              <p className="text-xs text-ink-light mt-2">
                {uploadForm.fileName || tr("支持 JSON 或 ZIP 插件包（ZIP 需包含 manifest.json + mode.json）", "Supports JSON or ZIP package (ZIP should include manifest.json + mode.json)", "Podržava JSON ili ZIP paket (ZIP treba sadržavati manifest.json + mode.json)")}
              </p>
              <button
                type="button"
                onClick={handleDownloadPluginTemplate}
                className="mt-2 text-xs text-ink underline hover:text-ink/70"
              >
                {tr("下载插件模板", "Download plugin template", "Preuzmi plugin predložak")}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-ink/10">
            <Button
              variant="outline"
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isUploadingPlugin}
              className="bg-white text-black border border-black hover:bg-black hover:text-white transition-colors"
            >
              {tr("取消", "Cancel", "Odustani")}
            </Button>
            <Button
              onClick={handleInstallLocalPlugin}
              disabled={isUploadingPlugin || !uploadForm.mac || !uploadForm.fileBase64}
              className="bg-ink text-white hover:bg-ink/90 transition-colors"
            >
              {isUploadingPlugin ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {tr("安装中...", "Installing...", "Instaliram...")}
                </>
              ) : (
                tr("安装插件", "Install Plugin", "Instaliraj Plugin")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Install dialog */}
      <Dialog
        open={installDeviceModal.open}
        onClose={() => setInstallDeviceModal({ open: false, modeId: null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setInstallDeviceModal({ open: false, modeId: null })}>
            <DialogTitle>{tr("选择安装设备", "Choose a Device to Install", "Odaberi Uređaj za Instalaciju")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {isLoadingDevices ? (
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl flex items-center justify-center">
                <Loader2 size={16} className="text-ink-light animate-spin" />
                <span className="ml-2 text-sm text-ink-light">{tr("加载中...", "Loading...", "Učitavanje...")}</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink-light text-sm">
                {tr("暂无设备，请先绑定设备", "No devices yet. Please bind a device first.", "Još nema uređaja. Najprije poveži uređaj.")}
              </div>
            ) : (
              <div className="space-y-2">
                {devices.map((device) => (
                  <button
                    key={device.mac}
                    onClick={() => {
                      if (installDeviceModal.modeId !== null) {
                        handleInstall(installDeviceModal.modeId, device.mac);
                      }
                    }}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:border-ink/25 hover:shadow-md transition-all duration-200"
                  >
                    <div className="font-medium text-ink">{device.nickname || device.mac}</div>
                    <div className="text-sm text-ink-light mt-1">{device.mac}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dialog actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-ink/10">
            <Button
              variant="outline"
              onClick={() => setInstallDeviceModal({ open: false, modeId: null })}
              className="bg-white text-black border border-black hover:bg-black hover:text-white transition-colors"
            >
              {tr("取消", "Cancel", "Odustani")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-ink/95 text-white px-4 py-3 rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.35)] backdrop-blur-sm animate-fade-in">
          <p className="text-sm">{toastMessage}</p>
        </div>
      )}
    </div>
  );
}
