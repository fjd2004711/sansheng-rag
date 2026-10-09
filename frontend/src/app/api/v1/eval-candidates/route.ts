import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/eval-candidates", { fallbackError: "读取评测候选失败" });
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/eval-candidates", { method: "POST", json: true, fallbackError: "加入评测集失败" });
}
