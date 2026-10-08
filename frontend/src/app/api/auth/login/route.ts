import { NextRequest, NextResponse } from "next/server";

import { loginWithPassword } from "@/lib/server-login";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ detail: "请填写邮箱和密码" }, { status: 400 });
  }
  return loginWithPassword(body.email, body.password);
}
