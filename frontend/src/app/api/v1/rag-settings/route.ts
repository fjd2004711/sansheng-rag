import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/rag-settings", { fallbackError: "读取参数失败" });
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/rag-settings", { method: "PUT", json: true, fallbackError: "保存参数失败" });
}
