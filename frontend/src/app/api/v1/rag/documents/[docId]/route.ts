import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await params;
    const headers: Record<string, string> = {};
    const accessToken = request.cookies.get("access_token")?.value;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    await backendFetch(`/api/v1/rag/documents/${docId}`, {
      method: "DELETE",
      headers,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
