import { NextRequest } from "next/server";

import { proxyGet } from "@/app/api/_proxy";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mac = searchParams.get("mac") || "";
  return proxyGet(`/api/render-json?mac=${encodeURIComponent(mac)}`, req);
}
