import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/users", { query: true, fallbackError: "加载用户失败" });
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/users", { method: "POST", json: true, fallbackError: "创建账号失败" });
}
