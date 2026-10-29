import { NextRequest, NextResponse } from "next/server";

import { backendFetch, BackendApiError } from "@/lib/server-api";
import { zhError } from "@/lib/zh-errors";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) return NextResponse.json({ detail: "未登录" }, { status: 401 });
  const { id } = await params;
  try {
    await backendFetch(`/api/v1/orchestration/runs/${encodeURIComponent(id)}/feedback`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(await request.json()),
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      const body = error.data as { detail?: string; error?: { message?: string } } | undefined;
      return NextResponse.json(
        { detail: zhError(body?.detail || body?.error?.message, "提交反馈失败") },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
