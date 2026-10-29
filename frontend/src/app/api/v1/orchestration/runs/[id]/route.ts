import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return proxyToBackend(request, `/api/v1/orchestration/runs/${encodeURIComponent(id)}`, {
    fallbackError: "读取运行失败",
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return proxyToBackend(request, `/api/v1/orchestration/runs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackError: "删除运行失败",
  });
}
