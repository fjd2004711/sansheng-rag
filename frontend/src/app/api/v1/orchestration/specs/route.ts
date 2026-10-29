import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/orchestration/specs", { fallbackError: "读取定义失败" });
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/orchestration/specs", {
    method: "POST",
    json: true,
    fallbackError: "保存定义失败",
  });
}
