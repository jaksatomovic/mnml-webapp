import { NextRequest } from "next/server";
import { proxyPost } from "@/app/api/_proxy";

export async function POST(req: NextRequest) {
  const search = req.nextUrl.search || "";
  return proxyPost(`/api/layout/validate${search}`, req);
}
