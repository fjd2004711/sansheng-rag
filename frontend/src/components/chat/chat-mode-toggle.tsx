"use client";

import { BookOpen, Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { useRetrievalScopeStore, type ChatMode } from "@/stores/retrieval-scope-store";

const MODES: Array<{ value: ChatMode; label: string; hint: string; icon: typeof Globe }> = [
  { value: "qa", label: "资料问答", hint: "只根据知识库里的资料回答", icon: BookOpen },
  { value: "research", label: "联网调研", hint: "在网上查找资料，逐条核对后作答，每句都标出网页出处", icon: Globe },
];

/** Switch between answering from the knowledge base and researching the web. */
export function ChatModeToggle() {
  const mode = useRetrievalScopeStore((state) => state.mode);
  const setMode = useRetrievalScopeStore((state) => state.setMode);

  return (
    <div role="radiogroup" aria-label="回答方式" className="bg-muted/60 inline-flex rounded-full p-0.5">
      {MODES.map(({ value, label, hint, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          title={hint}
          onClick={() => setMode(value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors",
            mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
