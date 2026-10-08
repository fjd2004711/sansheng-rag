"use client";

import type { ChatMessage } from "@/types";
import { FollowupChips } from "./followup-chips";
import { MessageItem } from "./message-item";

interface MessageListProps {
  messages: ChatMessage[];
  onRegenerate?: (messageId: string) => void;
  onShowTrace?: (messageId: string) => void;
  selectedTraceId?: string | null;
  onAsk?: (question: string) => void;
}

export function MessageList({ messages, onRegenerate, onShowTrace, selectedTraceId, onAsk }: MessageListProps) {
    const getGroupPosition = (
    message: ChatMessage,
  ): "first" | "middle" | "last" | "single" | undefined => {
    if (!message.groupId) return undefined;

    const groupMessages = messages.filter((m) => m.groupId === message.groupId);
    if (groupMessages.length <= 1) return "single";

    const groupIndex = groupMessages.findIndex((m) => m.id === message.id);
    if (groupIndex === 0) return "first";
    if (groupIndex === groupMessages.length - 1) return "last";
    return "middle";
  };

  // Only allow regenerating the most recent assistant message — older ones
  // would diverge the transcript in a confusing way.
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div className="space-y-0">
      {messages.map((message, index) => (
        <div key={message.id}>
          <MessageItem
            message={message}
            groupPosition={getGroupPosition(message)}
            onRegenerate={
              onRegenerate && index === lastAssistantIndex && !message.isStreaming
                ? () => onRegenerate(message.id)
                : undefined
            }
            onShowTrace={onShowTrace && message.agentTrace?.length ? () => onShowTrace(message.id) : undefined}
            traceSelected={selectedTraceId === message.id}
          />
          {onAsk && index === lastAssistantIndex && !message.isStreaming && message.suggestions?.length ? (
            <div className="pb-4 pl-10 sm:pl-[3.25rem]">
              <FollowupChips items={message.suggestions} onAsk={onAsk} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
