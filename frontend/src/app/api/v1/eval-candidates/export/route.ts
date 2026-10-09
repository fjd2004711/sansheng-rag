import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** Download the candidates as eval/p5-scenarios.jsonl lines. */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) return NextResponse.json({ detail: "未登录" }, { status: 401 });
  const response = await fetch(`${BACKEND_URL}/api/v1/eval-candidates/export`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return NextResponse.json({ detail: "导出失败" }, { status: response.status });
  return new NextResponse(await response.text(), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="eval-candidates.jsonl"',
    },
  });
}
