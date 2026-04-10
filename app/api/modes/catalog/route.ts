import { NextRequest } from "next/server";
import { proxyGet } from "@/app/api/_proxy";

export async function GET(req: NextRequest) {
  // forward query params e.g. ?mac=...
  const search = req.nextUrl.search || "";
  return proxyGet(`/api/modes/catalog${search}`, req);
}

