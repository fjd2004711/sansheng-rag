import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/orchestration/runs", {
    query: true,
    fallbackError: "读取运行列表失败",
  });
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/orchestration/runs", {
    method: "POST",
    json: true,
    fallbackError: "创建运行失败",
  });
}
