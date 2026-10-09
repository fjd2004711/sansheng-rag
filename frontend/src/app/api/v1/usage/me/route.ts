import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/usage/me", { query: true, fallbackError: "读取用量失败" });
}
