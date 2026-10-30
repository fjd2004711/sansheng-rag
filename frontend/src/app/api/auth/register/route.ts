import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import { zhError } from "@/lib/zh-errors";
import type { RegisterResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const data = await backendFetch<RegisterResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      const body = error.data as { detail?: string; error?: { message?: string } } | undefined;
      const detail = zhError(body?.detail || body?.error?.message, "注册失败");
      return NextResponse.json({ detail }, { status: error.status });
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
