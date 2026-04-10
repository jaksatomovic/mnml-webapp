import { NextRequest } from "next/server";
import { proxyGet, proxyPost } from "../_proxy";

export async function GET(req: NextRequest) {
  // Preserve query params passed by the webapp, for example ?mac=...
  const search = req.nextUrl.search || "";
  return proxyGet(`/api/modes${search}`, req);
}

export async function POST(req: NextRequest) {
  return proxyPost("/api/modes/custom", req);
}
