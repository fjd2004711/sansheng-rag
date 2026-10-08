"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { useAnswerFeedback } from "@/hooks/use-answer-feedback";
import { cn } from "@/lib/utils";
import type { AnswerFeedback, FeedbackReason } from "@/types";

export const FEEDBACK_REASONS: Array<{ value: FeedbackReason; label: string }> = [
  { value: "wrong", label: "答错了" },
  { value: "not_found", label: "资料里有，却没找到" },
  { value: "bad_citation", label: "引用对不上" },
  { value: "incomplete", label: "回答不完整" },
  { value: "other", label: "其他" },
];

interface FeedbackBarProps {
  conversationId: string;
  messageId: string;
  feedback?: AnswerFeedback | null;
}

export function FeedbackBar({ conversationId, messageId, feedback }: FeedbackBarProps) {
  const { submit, withdraw } = useAnswerFeedback(conversationId, messageId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState("");

  if (feedback) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        {feedback.rating === 1 ? <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" /> : <ThumbsDown className="h-3.5 w-3.5 text-amber-600" />}
        {feedback.rating === 1 ? "你觉得这个回答有帮助" : "你反馈了这个回答有问题"}
        <button type="button" onClick={() => void withdraw()} className="hover:text-foreground underline underline-offset-2">
          撤销
        </button>
      </p>
    );
  }

  return (
    <div className="text-muted-foreground flex items-center gap-1 text-xs">
      <span className="mr-1">这个回答有帮助吗？</span>
      <button
        type="button"
        title="有帮助"
        aria-label="有帮助"
        onClick={() => void submit({ rating: 1 })}
        className="hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-colors"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" title="有问题" aria-label="有问题" className="hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-colors">
            <ThumbsDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3 p-4">
          <p className="text-sm font-medium">哪里有问题？</p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setReason(item.value)}
                aria-pressed={reason === item.value}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  reason === item.value ? "border-foreground bg-foreground text-background" : "hover:bg-accent",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="补充说明（选填），比如正确答案是什么"
            className="bg-background w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await submit({ rating: -1, reason, comment: comment.trim() || null });
                setOpen(false);
              }}
            >
              提交
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
