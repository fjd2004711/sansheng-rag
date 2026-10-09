import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/proxy";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  return proxyToBackend(request, `/api/v1/conversations/${id}/messages/${messageId}/and-after`, {
    method: "DELETE",
    fallbackError: "无法修改这条消息",
  });
}
