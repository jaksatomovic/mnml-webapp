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
  const [isPublishing, setIsPublishing] = useState(false);
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
  
  // Publish form state.
  const [publishForm, setPublishForm] = useState({
    source_custom_mode_id: "",
    name: "",
    description: "",
    category: "",
    mac: "",
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
      setDevices(data.devices || []);
    } catch (err) {
      console.error("Failed to fetch devices:", err);
      setDevices([]);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [tr]);

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

  // Load devices when the publish dialog opens.
  useEffect(() => {
    if (isPublishModalOpen) {
      fetchDevices();
    }
  }, [isPublishModalOpen, fetchDevices]);

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
    <div className="min-h-screen bg-white">
      {/* Hero header */}
      <section className="border-b border-ink/10 bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:24px_24px]">
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
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-300 rounded-sm text-ink placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
              />
            </div>
          </div>

          {/* Category pills and publish action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap justify-center gap-3 flex-1">
              {categoryOptions.map((category) => (
                <button
                  key={category.value}
                  onClick={() => setSelectedCategory(category.value)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedCategory === category.value
                      ? "bg-ink text-white shadow-[2px_2px_0_0_#000000]"
                      : "bg-white text-ink hover:bg-gray-50 border border-gray-300 hover:border-black hover:shadow-[2px_2px_0_0_#000000]"
                  }`}
                >
                  {pickByLocale(locale, { zh: category.zh, en: category.en, hr: category.hr })}
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsPublishModalOpen(true)}
              className="bg-ink text-white rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-2 hover:bg-ink/90 transition-colors"
            >
              <Upload size={16} />
              {tr("发布模式", "Publish Mode", "Objavi Mod")}
            </button>
          </div>
        </div>
      </section>

      {/* Mode grid */}
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
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
                  className="group border border-gray-200 hover:border-black hover:shadow-[4px_4px_0_0_#000000] transition-all duration-200 flex flex-col"
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
                        <span className="px-2.5 py-1 text-xs font-medium text-ink bg-paper-dark rounded-sm whitespace-nowrap ml-3">
                          {pickByLocale(locale, {
                            en: categoryOptions.find((category) => category.value === mode.category)?.en || mode.category,
                            hr: categoryOptions.find((category) => category.value === mode.category)?.hr || mode.category,
                            zh: categoryOptions.find((category) => category.value === mode.category)?.zh || mode.category,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Thumbnail */}
                    <div className="w-full aspect-[4/3] mb-4 border border-gray-300 bg-white rounded-sm overflow-hidden relative">
                      {mode.thumbnail_url ? (
                        <Image
                          src={mode.thumbnail_url}
                          alt={mode.name}
                          fill
                          className="object-contain bg-white"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full border border-dashed border-gray-300 bg-white rounded-sm flex items-center justify-center flex-col">
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
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm flex items-center justify-center">
                  <Loader2 size={16} className="text-ink-light animate-spin" />
                  <span className="ml-2 text-sm text-ink-light">{tr("加载中...", "Loading...", "Učitavanje...")}</span>
                </div>
              ) : devices.length === 0 ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink-light text-sm">
                  {tr("暂无设备，请先绑定设备", "No devices yet. Please bind a device first.", "Još nema uređaja. Najprije poveži uređaj.")}
                </div>
              ) : (
                <select
                  value={publishForm.mac}
                  onChange={(e) => {
                    setPublishForm({ ...publishForm, mac: e.target.value, source_custom_mode_id: "" });
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink focus:outline-none focus:border-black transition-colors"
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
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm flex items-center justify-center">
                  <Loader2 size={16} className="text-ink-light animate-spin" />
                  <span className="ml-2 text-sm text-ink-light">{tr("加载中...", "Loading...", "Učitavanje...")}</span>
                </div>
              ) : customModes.length === 0 ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink-light text-sm">
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
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink focus:outline-none focus:border-black transition-colors"
                >
                  <option value="">{tr("请选择要分享的模式", "Choose a mode to share", "Odaberi mod za dijeljenje")}</option>
                  {customModes.map((mode) => (
                    <option key={mode.mode_id} value={mode.mode_id}>
                      {mode.mode_id}: {mode.display_name}
                    </option>
                  ))}
                </select>
              )}
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
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
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
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors font-serif leading-relaxed resize-none"
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
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink focus:outline-none focus:border-black transition-colors"
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
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm flex items-center justify-center">
                <Loader2 size={16} className="text-ink-light animate-spin" />
                <span className="ml-2 text-sm text-ink-light">{tr("加载中...", "Loading...", "Učitavanje...")}</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-ink-light text-sm">
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
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-sm text-left hover:border-black hover:shadow-[2px_2px_0_0_#000000] transition-all"
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
        <div className="fixed bottom-6 right-6 z-50 bg-ink text-white px-4 py-3 rounded-sm shadow-[4px_4px_0_0_#000000] animate-fade-in">
          <p className="text-sm">{toastMessage}</p>
        </div>
      )}
    </div>
  );
}
