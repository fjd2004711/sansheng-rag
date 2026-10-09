import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/api/v1/eval-candidates/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackError: "删除失败",
  });
}
