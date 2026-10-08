/** Forward an authenticated request from a Next.js route handler to the FastAPI backend. Server-side only. */
import { NextRequest, NextResponse } from "next/server";

import { backendFetch, BackendApiError } from "@/lib/server-api";
import { zhError } from "@/lib/zh-errors";

interface ProxyOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Forward the incoming JSON body. */
  json?: boolean;
  /** Forward the incoming query string. */
  query?: boolean;
  fallbackError: string;
}

export async function proxyToBackend(request: NextRequest, path: string, options: ProxyOptions): Promise<NextResponse> {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) return NextResponse.json({ detail: "未登录" }, { status: 401 });

  const method = options.method ?? "GET";
  const search = options.query ? request.nextUrl.search : "";
  try {
    const data = await backendFetch(`${path}${search}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: options.json ? JSON.stringify(await request.json()) : undefined,
    });
    return method === "DELETE" ? new NextResponse(null, { status: 204 }) : NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      const body = error.data as { detail?: string; error?: { message?: string } } | undefined;
      return NextResponse.json(
        { detail: zhError(body?.detail || body?.error?.message, options.fallbackError) },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "服务器内部错误" }, { status: 500 });
  }
}
