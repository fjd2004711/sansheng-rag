"use client";

import { useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";

import { Button, Input } from "@/components/ui";
import { RETRIEVAL_SCORE_LABELS } from "@/lib/agent-trace-labels";
import { searchDocuments, type RAGSearchResult } from "@/lib/rag-api";
import { getErrorMessage } from "@/lib/utils";

const EXAMPLES = ["退休手续", "津贴标准", "职称条件"];

/** Run the same retrieval the chat uses and show exactly which passages it would hand to the answer. */
export function KbSearch({ collection }: { collection: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RAGSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    try {
      const response = await searchDocuments({ query: trimmed, collection_name: collection, limit: 5 });
      setResults(response.results);
    } catch (cause) {
      setError(getErrorMessage(cause, "检索失败，请重试"));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm leading-relaxed">
        输入一个问题或关键词，看看系统会从资料里找出哪些原文。这和对话时的检索是同一套方法，用来检查资料有没有被正确读取。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(query);
        }}
        className="flex gap-2"
      >
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：退休手续要提前多久申请" className="h-10 rounded-xl" />
        <Button type="submit" disabled={searching || !query.trim()} className="h-10 rounded-xl">
          {searching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
          检索
        </Button>
      </form>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        试试：
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setQuery(example);
              void run(example);
            }}
            className="hover:bg-accent rounded-full border px-2.5 py-1"
          >
            {example}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {results !== null && results.length === 0 && !error && (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          没有找到相关资料。可以换一个说法，或者确认文件已经入库。
        </div>
      )}
      {results && results.length > 0 && (
        <ol className="space-y-2.5">
          {results.map((hit, index) => {
            const meta = hit.metadata;
            const scores = Object.keys(RETRIEVAL_SCORE_LABELS).filter((key) => typeof meta[key] === "number");
            return (
              <li key={index} className="space-y-1.5 rounded-xl border p-3.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded text-xs">{index + 1}</span>
                  <FileText className="text-muted-foreground h-4 w-4" />
                  <span className="font-medium">{String(meta.filename ?? "未知来源")}</span>
                  {typeof meta.chunk_num === "number" && <span className="text-muted-foreground text-xs">第 {meta.chunk_num + 1} 段</span>}
                </div>
                <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap">{hit.content.replace(/^#+\s*/gm, "")}</p>
                {scores.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {scores.map((key) => `${RETRIEVAL_SCORE_LABELS[key]} ${Number(meta[key]).toFixed(key === "reranker_score" ? 0 : 2)}`).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
