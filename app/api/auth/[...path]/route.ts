import { NextRequest } from "next/server";

import { proxyGet, proxyPost } from "@/app/api/_proxy";

function buildAuthPath(req: NextRequest, path: string[] | undefined): string {
  const encoded = (path || []).map((segment) => encodeURIComponent(segment)).join("/");
  const search = req.nextUrl.search || "";
  return `/api/auth/${encoded}${search}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyGet(buildAuthPath(req, path), req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyPost(buildAuthPath(req, path), req);
}
