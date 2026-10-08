import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId } = await params;
  return proxyToBackend(request, `/api/v1/users/${userId}`, { method: "PATCH", json: true, fallbackError: "更新用户失败" });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { userId } = await params;
  return proxyToBackend(request, `/api/v1/users/${userId}`, { method: "DELETE", fallbackError: "删除用户失败" });
}
