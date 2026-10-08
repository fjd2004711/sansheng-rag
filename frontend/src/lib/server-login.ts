/** Shared by the password login route and the optional demo auto-login route. Server-side only. */
import { NextResponse } from "next/server";

import { zhError } from "@/lib/zh-errors";
import { setAuthCookies } from "@/lib/auth-cookies";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import type { LoginResponse } from "@/types";

export async function loginWithPassword(email: string, password: string): Promise<NextResponse> {
  try {
    // Backend expects OAuth2 form data format
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    const data = await backendFetch<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const user = await backendFetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    // HTTP-only cookies carry the tokens. The access token is also returned in the body so the
    // client can authenticate the cross-origin WebSocket.
    const response = NextResponse.json({ user, access_token: data.access_token, message: "登录成功" });
    setAuthCookies(response, { accessToken: data.access_token, refreshToken: data.refresh_token });
    return response;
  } catch (error) {
    if (error instanceof BackendApiError) {
      const data = error.data as { detail?: string; error?: { message?: string } } | undefined;
      const detail = zhError(data?.detail || data?.error?.message, "登录失败");
      return NextResponse.json({ detail }, { status: error.status });
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
