"use client";

import { useState } from "react";

type RenderResponse = {
  layout?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
};

export default function SimulatorPage() {
  const [mac, setMac] = useState("");
  const [eventType, setEventType] = useState("build_failed");
  const [priority, setPriority] = useState("high");
  const [renderJson, setRenderJson] = useState<RenderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRender = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/render-json?mac=${encodeURIComponent(mac)}`);
      if (!res.ok) throw new Error(`Render failed (${res.status})`);
      const data = (await res.json()) as RenderResponse;
      setRenderJson(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const postEvent = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: eventType,
          priority,
          data: { source: "simulator", mac },
        }),
      });
      if (!res.ok) throw new Error(`Event failed (${res.status})`);
      await loadRender();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Device Simulator</h1>
      <p className="text-sm text-gray-600">
        Simulates the new mode/surface rendering response from backend.
      </p>

      <div className="space-y-2">
        <input
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="AA:BB:CC:DD:EE:FF"
          className="w-full rounded border px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder="event type"
            className="rounded border px-3 py-2"
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded border px-3 py-2">
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={loadRender} disabled={!mac || loading} className="rounded bg-black text-white px-3 py-2 disabled:opacity-50">
          Load Render JSON
        </button>
        <button onClick={postEvent} disabled={!mac || loading} className="rounded border px-3 py-2 disabled:opacity-50">
          Send Event
        </button>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      <pre className="rounded border bg-gray-50 p-3 text-xs overflow-auto min-h-64">
        {JSON.stringify(renderJson, null, 2)}
      </pre>
    </main>
  );
}
