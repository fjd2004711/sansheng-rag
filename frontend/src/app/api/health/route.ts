import { NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import type { HealthResponse } from "@/types";

export async function GET() {
  try {
    const data = await backendFetch<HealthResponse>("/api/v1/health");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ detail: "后端服务不可用" }, { status: error.status });
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
