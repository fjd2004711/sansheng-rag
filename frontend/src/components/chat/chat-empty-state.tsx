"use client";

import { ArrowUpRight, BookOpen, FileSearch, GitBranch, ShieldQuestion, Sparkles } from "lucide-react";

import { useAuth } from "@/hooks";

const PROMPTS = [
  {
    icon: FileSearch,
    title: "查找事实",
    prompt: "知识库里关于系统发布前置条件的规定是什么？",
  },
  {
    icon: BookOpen,
    title: "归纳要点",
    prompt: "请归纳知识库中最近入库文档的关键内容，并标注来源。",
  },
  {
    icon: GitBranch,
    title: "观察自纠错",
    prompt: "用一个比较含糊的说法询问某个具体凭证或代码，观察右侧「运作流程」如何诊断原因并换个问法。",
  },
  {
    icon: ShieldQuestion,
    title: "测试拒答",
    prompt: "问一个知识库里肯定没有的问题，看系统是否拒答而不是编造。",
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

