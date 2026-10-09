import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/llm-config/test", { method: "POST", json: true, fallbackError: "连接测试失败" });
}
