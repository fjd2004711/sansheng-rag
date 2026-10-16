import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/reports", {
    query: true,
    fallbackError: "读取报告列表失败",
  });
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/reports", {
    method: "POST",
    json: true,
    fallbackError: "创建报告失败",
  });
}
