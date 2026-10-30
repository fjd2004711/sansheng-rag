"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useChat } from "@/hooks";
import { AgentTracePanel } from "./agent-trace-panel";
import { ChatEmptyState } from "./chat-empty-state";
import { TraceDetailSheet } from "./trace-detail";
import { Activity, Download, History, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRetrievalScopeStore } from "@/stores/retrieval-scope-store";
import { conversationToMarkdown, downloadText } from "@/lib/export-markdown";
import { useChatSidebarStore } from "@/stores/chat-sidebar-store";
import { ChatModeToggle } from "./chat-mode-toggle";
import { LibraryPopover } from "./library-popover";
import { ModelSettings } from "./model-settings";
import { UsagePopover } from "./usage-popover";
import { ChatInput } from "./chat-input";
import { FilePreviewPanel } from "./file-preview-panel";
import { SourcesPanel } from "./sources-panel";
import { MessageList } from "./message-list";
import { PendingMessages } from "./pending-messages";
import { ToolApprovalDialog } from "./tool-approval-dialog";
import { QuestionPrompt, Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui";
import type { AgentTraceEvent, AnswerFeedback, PendingApproval, AskUserQuestion, AskUserAnswer, Decision } from "@/types";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { buildAssistantParts } from "@/lib/conversation-to-chat";
import { useConversationStore, useChatStore } from "@/stores";
import { useConversations } from "@/hooks";

const SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 150;

export function ChatContainer() {
  const {
    currentConversationId,
    currentMessages,
    isLoading: isConversationLoading,
  } = useConversationStore();
  const { addMessage: addChatMessage } = useChatStore();
  const { fetchConversations } = useConversations();
  const prevConversationIdRef = useRef<string | null | undefined>(undefined);

  const handleConversationCreated = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  const {
    messages,
    isConnected,
    isProcessing,
    sendMessage,
    resendFrom,
    stopGeneration,
    clearMessages,
    queuedMessages,
    cancelQueued,
    clearQueued,
    pendingApproval,
    sendResumeDecisions,
    pendingQuestions,
    sendAskUserResponses,
  } = useChat({
    conversationId: currentConversationId,
    onConversationCreated: handleConversationCreated,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // true = user deliberately scrolled up; suppress auto-scroll until they return to bottom
  const userScrolledUpRef = useRef(false);

  // Clear messages when conversation changes, but NOT when going from null to a new ID
  // (that happens when a new chat is saved - we want to keep the messages)
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    const currId = currentConversationId;

    // Skip initial mount
    if (prevId === undefined) {
      prevConversationIdRef.current = currId;
      return;
    }

    // Clear messages when:
    // 1. Going from a conversation to null (new chat)
    // 2. Switching between two different conversations
    // Do NOT clear when going from null to a conversation (new chat being saved)
    const shouldClear =
      currId === null || // Going to new chat
      (prevId !== null && prevId !== currId); // Switching between conversations

    if (shouldClear) {
      clearMessages();
      // Drop any pending queue when switching threads — those messages were
      // typed in the previous conversation's context, sending them into a
      // different conversation would surprise the user.
      clearQueued();
    }

    prevConversationIdRef.current = currId;
  }, [currentConversationId, clearMessages, clearQueued]);

  useEffect(() => {
    if (currentMessages.length > 0) {
      clearMessages();
      currentMessages.forEach((msg) => {
        const toolCalls = msg.tool_calls?.map((tc) => ({
          id: tc.tool_call_id,
          name: tc.tool_name,
          args: tc.args,
          result: tc.result,
          status: (tc.status === "failed" ? "error" : tc.status) as
            | "pending"
            | "running"
            | "completed"
            | "error",
        }));
        // Reconstruct an ordered timeline for assistant turns via the shared builder
        // (same one the demo replay uses), so thinking + reconstructed research +
        // tool/text parts render consistently across the chat and the demo.
        const parts =
          msg.role === "assistant"
            ? buildAssistantParts(toolCalls ?? [], msg.content, msg.id, msg.thinking)
            : undefined;
        addChatMessage({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          thinking: msg.thinking ?? undefined,
          agentTrace: msg.agent_trace?.length ? msg.agent_trace : undefined,
          timestamp: new Date(msg.created_at),
          conversationId: msg.conversation_id,
          toolCalls,
          parts,
          files: msg.files,
          fileIds: msg.files?.map((f) => f.id),
        });
      });
    }
  }, [currentMessages, addChatMessage, clearMessages]);

  // Track whether the user has manually scrolled up so we don't hijack their position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      userScrolledUpRef.current = distFromBottom > SCROLL_NEAR_BOTTOM_THRESHOLD_PX;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll on every messages update unless user has scrolled up
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleResend = useCallback(
    async (userIndex: number, content: string) => {
      const m = messages[userIndex];
      if (!m) return;
      try {
        await resendFrom(m.id, content, m.fileIds, m.files);
      } catch (error) {
        toast.error(getErrorMessage(error, "无法重新提问，请刷新后再试"));
      }
    },
    [messages, resendFrom],
  );

  const handleRegenerate = useCallback(
    (assistantMessageId: string) => {
      const idx = messages.findIndex((m) => m.id === assistantMessageId);
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
          void handleResend(i, messages[i]!.content);
          return;
        }
      }
    },
    [messages, handleResend],
  );

  const handleEdit = useCallback(
    (messageId: string, content: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) void handleResend(idx, content);
    },
    [messages, handleResend],
  );

  // Restore the user's earlier ratings when a saved conversation is opened.
  const updateChatMessage = useChatStore((state) => state.updateMessage);
  const ratedConversationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentConversationId || messages.length === 0) return;
    if (ratedConversationRef.current === currentConversationId) return;
    ratedConversationRef.current = currentConversationId;
    apiClient
      .get<{ items: Array<AnswerFeedback & { message_id: string }> }>(`/conversations/${currentConversationId}/feedback`)
      .then(({ items }) => {
        for (const item of items) {
          updateChatMessage(item.message_id, (message) => ({ ...message, feedback: { rating: item.rating, reason: item.reason, comment: item.comment } }));
        }
      })
      .catch(() => {});
  }, [currentConversationId, messages.length, updateChatMessage]);

  // Which answer's operation flow the side panel shows: the one the user picked, else the latest.
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedTraceId(null);
  }, [messages.length, currentConversationId]);
  const withTrace = messages.filter((message) => message.agentTrace?.length);
  const shownTrace =
    withTrace.find((message) => message.id === selectedTraceId) ?? withTrace[withTrace.length - 1];
  const traceQuestion = (() => {
    if (!shownTrace) return undefined;
    const at = messages.findIndex((message) => message.id === shownTrace.id);
    for (let i = at - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return messages[i]!.content;
    }
    return undefined;
  })();

  return (
    <ChatUI
      messages={messages}
      trace={shownTrace?.agentTrace ?? []}
      traceTitle={traceQuestion}
      traceMessageId={shownTrace?.id}
      selectedTraceId={selectedTraceId}
      onShowTrace={(id) => setSelectedTraceId((current) => (current === id ? null : id))}
      isConnected={isConnected}
      isProcessing={isProcessing}
      isLoadingConversation={
        currentConversationId !== null && isConversationLoading && messages.length === 0
      }
      sendMessage={sendMessage}
      onRegenerate={handleRegenerate}
      onEdit={handleEdit}
      queuedMessages={queuedMessages}
      onCancelQueued={cancelQueued}
      messagesEndRef={messagesEndRef}
      scrollContainerRef={scrollContainerRef}
      pendingApproval={pendingApproval}
      onResumeDecisions={sendResumeDecisions}
      pendingQuestions={pendingQuestions}
      onAnswerQuestions={sendAskUserResponses}
      onStop={stopGeneration}
    />
  );
}

interface ChatUIProps {
  messages: import("@/types").ChatMessage[];
  trace: AgentTraceEvent[];
  traceTitle?: string;
  traceMessageId?: string;
  selectedTraceId?: string | null;
  onShowTrace?: (messageId: string) => void;
  isConnected: boolean;
  isProcessing: boolean;
  /** True while a saved conversation is being loaded — show a skeleton, not empty state. */
  isLoadingConversation?: boolean;
  sendMessage: (
    content: string,
    fileIds?: string[],
    files?: import("@/types").ChatMessageFile[],
  ) => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  queuedMessages?: import("@/hooks/use-chat").QueuedMessage[];
  onCancelQueued?: (id: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  pendingApproval?: PendingApproval | null;
  onResumeDecisions?: (decisions: Decision[]) => void;
  pendingQuestions?: AskUserQuestion[] | null;
  onAnswerQuestions?: (answers: AskUserAnswer[]) => void;
  onStop?: () => void;
}

function ChatUI({
  messages,
  trace,
  traceTitle,
  traceMessageId,
  selectedTraceId,
  onShowTrace,
  isConnected,
  isProcessing,
  isLoadingConversation,
  sendMessage,
  onRegenerate,
  onEdit,
  queuedMessages,
  onCancelQueued,
  messagesEndRef,
  scrollContainerRef,
  pendingApproval,
  onResumeDecisions,
  pendingQuestions,
  onAnswerQuestions,
  onStop,
}: ChatUIProps) {
  const tc = useTranslations("common");
  const fast = useRetrievalScopeStore((state) => state.fast);
  const setFast = useRetrievalScopeStore((state) => state.setFast);
  const mode = useRetrievalScopeStore((state) => state.mode);
  const exportTitle = (messages.find((m) => m.role === "user")?.content ?? "").slice(0, 40);
  // Below lg the side column is hidden; the same flow opens in a drawer instead.
  const [flowOpen, setFlowOpen] = useState(false);
  return (
    <div className="flex h-full w-full">
      <div className="mx-auto flex h-full max-w-5xl min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => useChatSidebarStore.getState().open()}
            className="hover:bg-accent inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium md:hidden"
          >
            <History className="h-4 w-4" />
            历史对话
          </button>
          <button
            type="button"
            onClick={() => setFlowOpen(true)}
            className="hover:bg-accent inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium lg:hidden"
          >
            <Activity className="h-4 w-4" />
            运作流程
          </button>
        </div>
        <div
          ref={scrollContainerRef}
          className="flex-1 scrollbar-thin overflow-y-auto px-2 py-4 sm:px-4 sm:py-6"
        >
          {isLoadingConversation ? (
            <ConversationSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex min-h-full">
              <div className="my-auto w-full">
                <ChatEmptyState onPick={(prompt) => sendMessage(prompt)} />
              </div>
            </div>
          ) : (
            <MessageList
              messages={messages}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
              onShowTrace={onShowTrace}
              selectedTraceId={selectedTraceId}
              onAsk={(question) => sendMessage(question)}
            />
          )}
          <div ref={messagesEndRef} />
        </div>{" "}
        {pendingApproval && onResumeDecisions && (
          <div className="px-2 pb-2 sm:px-4 sm:pb-2">
            <ToolApprovalDialog
              actionRequests={pendingApproval.actionRequests}
              reviewConfigs={pendingApproval.reviewConfigs}
              onDecisions={onResumeDecisions}
              disabled={!isConnected}
            />
          </div>
        )}
        {pendingQuestions && pendingQuestions.length > 0 && onAnswerQuestions && (
          <div className="px-2 pb-2 sm:px-4 sm:pb-2">
            <QuestionPrompt
              questions={pendingQuestions}
              disabled={!isConnected}
              onComplete={onAnswerQuestions}
            />
          </div>
        )}
        <div className="px-2 pb-2 sm:px-4 sm:pb-4">
          {queuedMessages && queuedMessages.length > 0 && onCancelQueued && (
            <PendingMessages messages={queuedMessages} onCancel={onCancelQueued} />
          )}
          <div className="bg-card border-border focus-within:border-foreground/30 rounded-2xl border transition-colors">
            <div className="px-3 pt-3 sm:px-4 sm:pt-4">
              <ChatInput
                onSend={sendMessage}
                disabled={
                  !isConnected ||
                  !!pendingApproval ||
                  !!(pendingQuestions && pendingQuestions.length)
                }
                isProcessing={isProcessing}
                onStop={onStop}
              />
            </div>
            <div className="border-foreground/8 flex items-center justify-between border-t px-3 py-2 sm:px-4">
              {/* Wraps onto a second row when the column is narrow (trace panel open, phones); controls never break mid-word. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 [&_button]:whitespace-nowrap">
                <span
                  className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase ${isConnected ? "text-muted-foreground" : "text-destructive"}`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isConnected ? "bg-emerald-500" : "bg-destructive"
                    }`}
                  />
                  {isConnected ? tc("live") : tc("offline")}
                </span>
                <ChatModeToggle />
                {mode === "qa" && <LibraryPopover />}
                <ModelSettings />
                <UsagePopover />
                {mode === "qa" && (
                <button
                  type="button"
                  aria-pressed={fast}
                  onClick={() => setFast(!fast)}
                  title={fast ? "快速模式已开：回答立即显示，但不会逐条核对" : "开启后跳过逐条核对，回答更快但未经检查"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
                    fast ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                  )}
                >
                  <Zap className="h-3.5 w-3.5" />
                  快速模式
                </button>
                )}
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadText(
                        `${exportTitle || "对话记录"}.md`,
                        conversationToMarkdown(exportTitle, messages),
                      )
                    }
                    className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="text-foreground/40 mt-2 text-center text-xs">
            回答由 AI 生成，重要内容请对照来源核实。
          </p>
        </div>
      </div>
      <AgentTracePanel trace={trace} title={traceTitle} messageId={traceMessageId} />
      <Sheet open={flowOpen} onOpenChange={setFlowOpen}>
        <SheetContent side="right" className="w-full max-w-md p-0 lg:hidden">
          <SheetHeader className="h-12 px-4">
            <SheetTitle>运作流程</SheetTitle>
            <SheetClose onClick={() => setFlowOpen(false)} />
          </SheetHeader>
          <div className="h-[calc(100%-48px)]">
            <AgentTracePanel variant="sheet" trace={trace} title={traceTitle} messageId={traceMessageId} />
          </div>
        </SheetContent>
      </Sheet>
      <TraceDetailSheet />
      <FilePreviewPanel />
      <SourcesPanel />
    </div>
  );
}

function ConversationSkeleton() {
  // Two faux message bubbles — left (assistant) and right (user) — at the rough
  // proportions a real exchange has, so the layout doesn't pop when messages
  // arrive. Just enough motion to signal "loading", no shimmer chrome.
  return (
    <div className="space-y-6 py-4 sm:py-6">
      <div className="flex gap-2 sm:gap-4">
        <div className="bg-foreground/10 h-8 w-8 shrink-0 animate-pulse rounded-full sm:h-9 sm:w-9" />
        <div className="flex max-w-[85%] flex-1 flex-col gap-2">
          <div className="bg-foreground/10 h-4 w-1/3 animate-pulse rounded-md" />
          <div className="bg-foreground/8 h-4 w-4/5 animate-pulse rounded-md" />
          <div className="bg-foreground/8 h-4 w-2/3 animate-pulse rounded-md" />
        </div>
      </div>
      <div className="flex flex-row-reverse gap-2 sm:gap-4">
        <div className="bg-foreground/10 h-8 w-8 shrink-0 animate-pulse rounded-full sm:h-9 sm:w-9" />
        <div className="flex max-w-[85%] flex-1 flex-col items-end gap-2">
          <div className="bg-foreground/10 h-4 w-1/4 animate-pulse rounded-md" />
          <div className="bg-foreground/8 h-4 w-3/5 animate-pulse rounded-md" />
        </div>
      </div>
      <div className="flex gap-2 sm:gap-4">
        <div className="bg-foreground/10 h-8 w-8 shrink-0 animate-pulse rounded-full sm:h-9 sm:w-9" />
        <div className="flex max-w-[85%] flex-1 flex-col gap-2">
          <div className="bg-foreground/8 h-4 w-3/4 animate-pulse rounded-md" />
          <div className="bg-foreground/8 h-4 w-1/2 animate-pulse rounded-md" />
        </div>
      </div>
    </div>
  );
}
