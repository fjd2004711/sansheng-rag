import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { docId } = await params;
  return proxyToBackend(request, `/api/v1/rag/my/documents/${encodeURIComponent(docId)}/retry`, {
    method: "POST",
    fallbackError: "重新入库失败",
  });
}
