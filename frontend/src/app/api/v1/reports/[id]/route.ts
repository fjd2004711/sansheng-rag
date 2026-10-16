import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return proxyToBackend(request, `/api/v1/reports/${encodeURIComponent(id)}`, {
    fallbackError: "读取报告失败",
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return proxyToBackend(request, `/api/v1/reports/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackError: "删除报告失败",
  });
}
