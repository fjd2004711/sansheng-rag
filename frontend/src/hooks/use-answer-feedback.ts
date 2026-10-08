"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { AnswerFeedback } from "@/types";

/** Submit or withdraw the current user's rating of one answer, keeping the chat store in sync. */
export function useAnswerFeedback(conversationId: string | null | undefined, messageId: string) {
  const updateMessage = useChatStore((state) => state.updateMessage);

  const submit = useCallback(
    async (feedback: AnswerFeedback) => {
      if (!conversationId) return;
      try {
        await apiClient.put(`/conversations/${conversationId}/messages/${messageId}/feedback`, feedback);
        updateMessage(messageId, (message) => ({ ...message, feedback }));
        toast.success(feedback.rating === 1 ? "谢谢，已记录" : "谢谢反馈，我们会据此改进");
      } catch (error) {
        toast.error(getErrorMessage(error, "提交反馈失败"));
      }
    },
    [conversationId, messageId, updateMessage],
  );

  const withdraw = useCallback(async () => {
    if (!conversationId) return;
    try {
      await apiClient.delete(`/conversations/${conversationId}/messages/${messageId}/feedback`);
      updateMessage(messageId, (message) => ({ ...message, feedback: null }));
    } catch (error) {
      toast.error(getErrorMessage(error, "撤销失败"));
    }
  }, [conversationId, messageId, updateMessage]);

  return { submit, withdraw };
}
