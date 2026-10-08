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

    const data = await backendFetch(`/api/v1/conversations/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "加载对话失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ detail: "未登录" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const data = await backendFetch(`/api/v1/conversations/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "更新对话失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ detail: "未登录" }, { status: 401 });
    }

    const { id } = await params;

    await backendFetch(`/api/v1/conversations/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "删除对话失败" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
