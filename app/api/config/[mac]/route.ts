import { NextRequest } from "next/server";
import { proxyGet } from "@/app/api/_proxy";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mac: string }> },
) {
  const { mac } = await params;
  // Next.js route params arrive decoded, so re-encode the MAC address here.
  // Example format: 88:56:A6:7B:C7:0C, where the colons must be escaped.
  const encodedMac = encodeURIComponent(mac);
  return proxyGet(`/api/config/${encodedMac}`, req);
}
