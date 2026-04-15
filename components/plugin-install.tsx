"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { authHeaders } from "@/lib/auth";

export type PluginDevice = { mac: string; nickname?: string };

async function fileToPayload(file: File): Promise<{ fileName: string; fileBase64: string }> {
  const isZip = file.name.toLowerCase().endsWith(".zip");
  if (isZip) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { fileName: file.name, fileBase64: btoa(binary) };
  }
  const text = await file.text();
  JSON.parse(text);
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return { fileName: file.name, fileBase64: b64 };
}

export function downloadPluginTemplateJson() {
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
}

type PluginInstallDialogProps = {
  open: boolean;
  onClose: () => void;
  devices: PluginDevice[];
  defaultMac?: string;
  /** Called after a successful install; receives the device MAC used. */
  onInstalled?: (mac: string, action?: string) => void;
};

export function PluginInstallDialog({
  open,
  onClose,
  devices,
  defaultMac,
  onInstalled,
}: PluginInstallDialogProps) {
  const [mac, setMac] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFileName("");
      setFileBase64("");
      setFileError(null);
      return;
    }
    const first = devices[0]?.mac || "";
    const pick =
      defaultMac && devices.some((d) => d.mac === defaultMac) ? defaultMac : first;
    setMac(pick);
  }, [open, devices, defaultMac]);

  const handleFile = async (file: File | null) => {
    setFileError(null);
    if (!file) return;
    try {
      const payload = await fileToPayload(file);
      setFileName(payload.fileName);
      setFileBase64(payload.fileBase64);
    } catch {
      setFileError("Invalid file. Upload a JSON or ZIP plugin package.");
      setFileName("");
      setFileBase64("");
    }
  };

  const handleInstall = async () => {
    if (!mac || !fileBase64) return;
    setUploading(true);
    try {
      const response = await fetch("/api/discover/plugins/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          mac,
          plugin_base64: fileBase64,
          plugin_filename: fileName,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Install failed");
      }
      const action = String(data?.action || "installed");
      onInstalled?.(mac, action);
      onClose();
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader onClose={onClose}>
          <DialogTitle>Upload and install plugin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Device <span className="text-red-500">*</span>
            </label>
            <select
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink focus:outline-none focus:border-black transition-colors"
            >
              <option value="">Choose a device</option>
              {devices.map((device) => (
                <option key={device.mac} value={device.mac}>
                  {device.nickname || device.mac} ({device.mac})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Plugin file (.json or .zip) <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="application/json,.json,application/zip,.zip"
              onChange={(e) => void handleFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-ink"
            />
            <p className="text-xs text-ink-light mt-2">
              {fileName || "ZIP should include manifest.json and mode.json."}
            </p>
            <button
              type="button"
              onClick={downloadPluginTemplateJson}
              className="mt-2 text-xs text-ink underline hover:text-ink/70"
            >
              Download plugin template (JSON)
            </button>
            {fileError ? <p className="text-xs text-red-600 mt-2">{fileError}</p> : null}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-ink/10">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
            className="bg-white text-black border border-black hover:bg-black hover:text-white transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleInstall()}
            disabled={uploading || !mac || !fileBase64}
            className="bg-ink text-white hover:bg-ink/90 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Installing…
              </>
            ) : (
              "Install plugin"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type AddWidgetDialogProps = {
  open: boolean;
  onClose: () => void;
  devices: PluginDevice[];
  defaultMac?: string;
  onInstalled?: (mac: string, action?: string) => void;
  onCreateWithAI: () => void;
  discoverHref: string;
};

export function AddWidgetDialog({
  open,
  onClose,
  devices,
  defaultMac,
  onInstalled,
  onCreateWithAI,
  discoverHref,
}: AddWidgetDialogProps) {
  const [mac, setMac] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFileName("");
      setFileBase64("");
      setFileError(null);
      return;
    }
    const first = devices[0]?.mac || "";
    const pick =
      defaultMac && devices.some((d) => d.mac === defaultMac) ? defaultMac : first;
    setMac(pick);
  }, [open, devices, defaultMac]);

  const handleFile = async (file: File | null) => {
    setFileError(null);
    if (!file) return;
    try {
      const payload = await fileToPayload(file);
      setFileName(payload.fileName);
      setFileBase64(payload.fileBase64);
    } catch {
      setFileError("Invalid file. Upload a JSON or ZIP plugin package.");
      setFileName("");
      setFileBase64("");
    }
  };

  const handleInstall = async () => {
    if (!mac || !fileBase64) return;
    setUploading(true);
    try {
      const response = await fetch("/api/discover/plugins/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          mac,
          plugin_base64: fileBase64,
          plugin_filename: fileName,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Install failed");
      }
      const action = String(data?.action || "installed");
      onInstalled?.(mac, action);
      onClose();
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setUploading(false);
    }
  };

  const goAi = () => {
    onClose();
    onCreateWithAI();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader onClose={onClose}>
          <DialogTitle>Add a custom widget</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-ink-light -mt-2 mb-2">
          Install a plugin package on your device first. Publishing to the community is done separately on{" "}
          <Link href={discoverHref} className="text-ink underline font-medium">
            Discover
          </Link>{" "}
          while signed in.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Device <span className="text-red-500">*</span>
            </label>
            <select
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-ink focus:outline-none focus:border-black transition-colors"
            >
              <option value="">Choose a device</option>
              {devices.map((device) => (
                <option key={device.mac} value={device.mac}>
                  {device.nickname || device.mac} ({device.mac})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Plugin file (.json or .zip) <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="application/json,.json,application/zip,.zip"
              onChange={(e) => void handleFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-ink"
            />
            <p className="text-xs text-ink-light mt-2">
              {fileName || "ZIP should include manifest.json and mode.json."}
            </p>
            <button
              type="button"
              onClick={downloadPluginTemplateJson}
              className="mt-2 text-xs text-ink underline hover:text-ink/70"
            >
              Download plugin template (JSON)
            </button>
            {fileError ? <p className="text-xs text-red-600 mt-2">{fileError}</p> : null}
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-ink/20 bg-paper-dark/40 p-3 mt-2">
          <p className="text-xs font-medium text-ink mb-2">Other option</p>
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={goAi}>
            Create with AI instead
          </Button>
          <p className="text-[11px] text-ink-light mt-2">
            Describe what you want and generate a preview; you can save from the preview panel.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-ink/10">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
            className="bg-white text-black border border-black hover:bg-black hover:text-white transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleInstall()}
            disabled={uploading || !mac || !fileBase64}
            className="bg-ink text-white hover:bg-ink/90 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Installing…
              </>
            ) : (
              "Install plugin"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
