import { NextRequest } from "next/server";
import { proxyDelete } from "@/app/api/_proxy";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> }
) {
  const { pluginId } = await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.toString();
  const path = query
    ? `/api/discover/plugins/${pluginId}?${query}`
    : `/api/discover/plugins/${pluginId}`;
  return proxyDelete(path, req);
}
