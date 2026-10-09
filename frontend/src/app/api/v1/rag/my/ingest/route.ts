import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** Upload a file to the signed-in user's private library. */
export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;
    if (!accessToken) return NextResponse.json({ detail: "未登录" }, { status: 401 });

    const response = await fetch(`${BACKEND_URL}/api/v1/rag/my/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: await request.formData(),
    });
    const body = await response.json().catch(() => ({ detail: "上传失败" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
