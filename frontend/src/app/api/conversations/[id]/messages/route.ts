import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ detail: "未登录" }, { status: 401 });
    }

    const { id } = await params;

    const data = await backendFetch(`/api/v1/conversations/${id}/messages`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "加载消息失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
