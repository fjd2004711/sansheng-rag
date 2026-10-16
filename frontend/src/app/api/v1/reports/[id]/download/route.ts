/** Stream a rendered report file (Word / PDF) from the backend; the JSON proxy cannot carry binary bodies. */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) return NextResponse.json({ detail: "未登录" }, { status: 401 });
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const response = await fetch(
    `${BACKEND_URL}/api/v1/reports/${encodeURIComponent(id)}/download?format=${format}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    return NextResponse.json(
      { detail: response.status === 400 ? "报告还没有生成完成" : "下载报告失败" },
      { status: response.status },
    );
  }
  return new NextResponse(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition":
        response.headers.get("content-disposition") ?? `attachment; filename=report.${format}`,
    },
  });
}
