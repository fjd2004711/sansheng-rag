import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

type Params = { params: Promise<{ name: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const { name } = await params;
  return proxyToBackend(request, `/api/v1/orchestration/specs/${encodeURIComponent(name)}`, {
    method: "DELETE",
    fallbackError: "删除定义失败",
  });
}
