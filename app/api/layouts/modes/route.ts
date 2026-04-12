import { NextRequest } from "next/server";
import { proxyGet } from "@/app/api/_proxy";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search || "";
  return proxyGet(`/api/layouts/modes${search}`, req);
}
