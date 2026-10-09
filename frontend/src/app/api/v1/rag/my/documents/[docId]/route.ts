import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  return proxyToBackend(request, `/api/v1/rag/my/documents/${encodeURIComponent(docId)}`, {
    method: "DELETE",
    fallbackError: "删除失败",
  });
}
