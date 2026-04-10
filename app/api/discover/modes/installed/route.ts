import { NextRequest } from "next/server";
import { proxyGet } from "@/app/api/_proxy";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.toString();
  const path = query ? `/api/discover/modes/installed?${query}` : "/api/discover/modes/installed";
  return proxyGet(path, req);
}
