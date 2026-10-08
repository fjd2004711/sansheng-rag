import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    const accessToken = request.cookies.get("access_token")?.value;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const data = await backendFetch("/api/v1/agent/models", { headers });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "获取模型列表失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
