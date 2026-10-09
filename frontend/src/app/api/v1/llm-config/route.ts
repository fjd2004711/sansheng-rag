import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/llm-config", { fallbackError: "读取模型设置失败" });
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/llm-config", { method: "PUT", json: true, fallbackError: "保存模型设置失败" });
}

export async function DELETE(request: NextRequest) {
  // The backend answers with the server-default config; the proxy turns DELETE into 204, so refetch afterwards.
  return proxyToBackend(request, "/api/v1/llm-config", { method: "DELETE", fallbackError: "恢复默认模型失败" });
}
