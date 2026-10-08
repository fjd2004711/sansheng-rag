"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { Button, Spinner } from "@/components/ui";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isProcessing?: boolean;
  /** When set, a stop control replaces the send button while processing. */
  onStop?: () => void;
}

const MAX_HEIGHT_PX = 200;

export function ChatInput({ onSend, disabled, isProcessing, onStop }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Tracks an active IME composition (pinyin etc.). Some browsers fire the confirming Enter
  // *after* compositionend, so `isComposing` alone is not enough.
  const composingRef = useRef(false);

  useEffect(() => {
    if (!isProcessing && !disabled) textareaRef.current?.focus();
  }, [isProcessing, disabled]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [message]);

  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled || isProcessing) return;
    onSend(trimmed);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // Enter that confirms an IME candidate must not send a half-typed question.
    if (e.nativeEvent.isComposing || composingRef.current || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2"
    >
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          // Clear on the next tick so the Enter that ends composition is still ignored.
          setTimeout(() => {
            composingRef.current = false;
          }, 0);
        }}
        placeholder="输入你的问题，回车发送，Shift+回车换行"
        aria-label="输入你的问题"
        disabled={disabled}
        rows={1}
        className="placeholder:text-muted-foreground min-h-[40px] flex-1 resize-none scrollbar-thin bg-transparent py-2.5 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
      />
      <div className="flex shrink-0 items-center pb-1">
        {isProcessing && onStop ? (
          <Button type="button" size="icon" onClick={onStop} className="h-9 w-9 rounded-lg" title="停止生成">
            <span className="h-3 w-3 rounded-[3px] bg-current" aria-hidden="true" />
            <span className="sr-only">停止生成</span>
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={disabled || !message.trim()} className="h-9 w-9 rounded-lg">
            {isProcessing ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">发送</span>
          </Button>
        )}
      </div>
    </form>
  );
}
