"use client";

import Link from "next/link";

import { Fishtail } from "@/components/brand/fishtail";
import { useAuth } from "@/hooks";
import { useLibrary } from "@/hooks/use-library";
import { ROUTES } from "@/lib/constants";
import { useRetrievalScopeStore } from "@/stores/retrieval-scope-store";

interface ChatEmptyStateProps {
  onPick: (prompt: string) => void;
}

function greeting(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

const stem = (filename: string) => filename.replace(/\.[^.]+$/, "");

/**
 * No canned questions: the only suggestions are built from the documents this person can actually ask about,
 * so they are always relevant and disappear when there is nothing to suggest.
 */
export function ChatEmptyState({ onPick }: ChatEmptyStateProps) {
  const { user } = useAuth();
  const { library, loading } = useLibrary();
  const sources = useRetrievalScopeStore((state) => state.sources);
  const name = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0];

  const mine = library?.personal ?? [];
  const shared = library?.documents ?? [];
  const pool = sources === "mine" ? mine : sources === "shared" ? shared : [...mine, ...shared];
  const picks = pool.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-12 text-center md:py-16">
      <Fishtail size={72} />
      <h2 className="text-foreground mt-5 text-2xl font-semibold tracking-tight md:text-3xl">
        {greeting(new Date().getHours())}
        {name ? `，${name}` : ""}
      </h2>
      <p className="text-muted-foreground font-kai mt-2 text-base">
        问我资料里的事，我查证之后再回答。
      </p>

      {!loading && picks.length > 0 && (
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {picks.map((doc) => (
            <button
              key={doc.filename}
              type="button"
              onClick={() => onPick(`《${stem(doc.filename)}》主要讲了什么？`)}
              className="border-border hover:bg-accent max-w-full truncate rounded-full border px-3.5 py-1.5 text-sm transition-colors"
              title={doc.filename}
            >
              《{stem(doc.filename)}》讲了什么
            </button>
          ))}
        </div>
      )}
      {!loading && pool.length === 0 && (
        <p className="text-muted-foreground mt-6 text-sm">
          还没有可用的资料，先去
          <Link href={ROUTES.RAG} className="text-foreground mx-1 underline underline-offset-2">
            知识库
          </Link>
          添加。
        </p>
      )}
    </div>
  );
}
