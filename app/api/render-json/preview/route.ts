import { NextRequest } from "next/server";

import { proxyPost } from "@/app/api/_proxy";

export async function POST(req: NextRequest) {
  return proxyPost("/api/render-json/preview", req);
}
