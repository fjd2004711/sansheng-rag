import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id, messageId } = await params;
  return proxyToBackend(request, `/api/v1/conversations/${id}/messages/${messageId}/feedback`, {
    method: "PUT",
    json: true,
    fallbackError: "提交反馈失败",
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, messageId } = await params;
  return proxyToBackend(request, `/api/v1/conversations/${id}/messages/${messageId}/feedback`, {
    method: "DELETE",
    fallbackError: "撤销反馈失败",
  });
}
