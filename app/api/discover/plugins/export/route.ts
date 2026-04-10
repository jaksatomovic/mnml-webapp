import { NextRequest, NextResponse } from "next/server";

const backendBaseEnv = process.env.INKSIGHT_BACKEND_API_BASE?.replace(/\/$/, "") || "";
const backendBase = backendBaseEnv || "http://127.0.0.1:8080";

function passthroughHeaders(req: NextRequest): HeadersInit {
  const headers: Record<string, string> = {};
  const authorization = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  const deviceToken = req.headers.get("x-device-token");
  if (authorization) headers.authorization = authorization;
  if (cookie) headers.cookie = cookie;
  if (deviceToken) headers["x-device-token"] = deviceToken;
  return headers;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.toString();
  const target = `${backendBase}/api/discover/plugins/export${query ? `?${query}` : ""}`;
  try {
    const res = await fetch(target, {
      cache: "no-store",
      headers: passthroughHeaders(req),
    });
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const cd = res.headers.get("content-disposition") || 'attachment; filename="plugin.zip"';
    return new NextResponse(buf, {
      status: res.status,
      headers: {
        "content-type": contentType,
        "content-disposition": cd,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "upstream fetch failed";
    return NextResponse.json(
      { error: "upstream_unreachable", message: msg, backend: backendBase },
      { status: 503 },
    );
  }
}
