import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";

interface RouteParams {
  params: Promise<{ name: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const headers: Record<string, string> = {};
    const accessToken = request.cookies.get("access_token")?.value;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const data = await backendFetch(`/api/v1/rag/collections/${name}/info`, { headers });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "获取集合信息失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const headers: Record<string, string> = {};
    const accessToken = request.cookies.get("access_token")?.value;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    await backendFetch(`/api/v1/rag/collections/${name}`, {
      method: "DELETE",
      headers,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "删除集合失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
