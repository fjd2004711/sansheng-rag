"use client";

import Link from "next/link";
import { Library as LibraryIcon } from "lucide-react";

import { useLibrary } from "@/hooks/use-library";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useRetrievalScopeStore, type SourceChoice } from "@/stores/retrieval-scope-store";

/** Which library this conversation answers from. Uploading and deleting live on the Knowledge Base page. */
export function LibraryPopover() {
  const { library, loading } = useLibrary();
  const { sources, setSources } = useRetrievalScopeStore();
  const shared = library?.documents.length ?? 0;
  const mine = library?.personal.length ?? 0;

  const options: Array<{ value: SourceChoice; label: string; count: number; disabled?: boolean; hint: string }> = [
    { value: "all", label: "全部", count: shared + mine, hint: "同时使用共享资料和我的资料" },
    { value: "shared", label: "共享库", count: shared, hint: "只使用管理员维护的共享资料" },
    {
      value: "mine",
      label: "我的资料",
      count: mine,
      disabled: mine === 0,
      hint: mine === 0 ? "你还没有上传资料，先到“知识库”页添加" : "只使用你自己上传的资料",
    },
  ];
  // A saved choice can outlive its library (e.g. all personal files deleted): fall back visibly.
  const active = options.find((option) => option.value === sources && !option.disabled) ?? options[0]!;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <LibraryIcon className="h-3.5 w-3.5" />
        {loading ? "读取中…" : "回答依据"}
      </span>
      <div role="radiogroup" aria-label="回答依据" className="bg-muted/60 inline-flex rounded-full p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active.value === option.value}
            disabled={option.disabled}
            title={option.hint}
            onClick={() => setSources(option.value)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              active.value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {!loading && <span className="text-muted-foreground ml-1 tabular-nums">{option.count}</span>}
          </button>
        ))}
      </div>
      <Link href={ROUTES.RAG} className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline">
        管理
      </Link>
    </div>
  );
}
