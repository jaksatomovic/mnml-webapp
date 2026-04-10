import { NextRequest } from "next/server";
import { proxyGet } from "@/app/api/_proxy";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  return proxyGet(`/api/preview${qs}`, req);
}
