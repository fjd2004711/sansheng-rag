import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/insights", { query: true, fallbackError: "读取知识缺口失败" });
}
