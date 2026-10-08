"use client";

import { ArrowUpRight, BookOpen, FileSearch, GitBranch, ShieldQuestion, Sparkles } from "lucide-react";

import { useAuth } from "@/hooks";

const PROMPTS = [
  {
    icon: FileSearch,
    title: "退休返聘",
    prompt: "返聘教师每周最多可以上几节课？",
  },
  {
    icon: BookOpen,
    title: "退休手续",
    prompt: "办理退休手续要提前多久申请？",
  },
  {
    icon: GitBranch,
    title: "课时津贴",
    prompt: "超课时津贴每节多少钱？",
  },
  {
    icon: ShieldQuestion,
    title: "职称申报",
    prompt: "申报高级教师职称需要满足哪些条件？",
  },
];

interface ChatEmptyStateProps {
  onPick: (prompt: string) => void;
}

export function ChatEmptyState({ onPick }: ChatEmptyStateProps) {
  const { user } = useAuth();
  const firstName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 md:py-16">
      <div className="text-center">
        <div className="bg-muted text-foreground mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="text-foreground font-display text-2xl font-semibold tracking-tight md:text-3xl">
          {firstName ? `${firstName}，想查点什么？` : "想查点什么？"}
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
          基于知识库回答，附带引用；检索或回答不可靠时会先诊断原因再有界纠错，或明确拒答。
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PROMPTS.map((p) => (
          <button
            key={p.title}
            type="button"
            onClick={() => onPick(p.prompt)}
            className="group border-border bg-card hover:border-foreground/30 hover:bg-accent flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
          >
            <span className="bg-muted text-muted-foreground group-hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors">
              <p.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium">{p.title}</p>
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
                {p.prompt}
              </p>
            </div>
            <ArrowUpRight className="text-muted-foreground/50 group-hover:text-foreground mt-0.5 h-4 w-4 shrink-0 transition-colors" />
          </button>
        ))}
      </div>

    </div>
  );
}

