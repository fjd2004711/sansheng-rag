import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  return proxyToBackend(request, "/api/v1/orchestration/specs/validate", {
    method: "POST",
    json: true,
    fallbackError: "校验定义失败",
  });
}
