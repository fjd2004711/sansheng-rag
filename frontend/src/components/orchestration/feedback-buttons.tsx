"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { cn, getErrorMessage } from "@/lib/utils";

const TAGS = ["口径不对", "数据有误", "建议空泛", "太慢"];

/** Thumbs up / down on a finished run; a thumbs down can say what was wrong (feeds the improvement hints). */
export function FeedbackButtons({ runId }: { runId: string }) {
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const send = async (rating: 1 | -1, chosen: string[] = []) => {
    setRated(rating);
    try {
      await apiClient.post(`/v1/orchestration/runs/${runId}/feedback`, {
        rating,
        tags: rating < 0 ? chosen : [],
      });
      toast.success("已记录，谢谢反馈");
    } catch (error) {
      toast.error(getErrorMessage(error, "提交反馈失败"));
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="有帮助"
        onClick={() => void send(1)}
        className={cn(
          "hover:bg-muted rounded-md p-1.5 transition-colors",
          rated === 1 ? "text-emerald-600" : "text-muted-foreground",
        )}
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="没帮助"
            className={cn(
              "hover:bg-muted rounded-md p-1.5 transition-colors",
              rated === -1 ? "text-red-600" : "text-muted-foreground",
            )}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3 p-3">
          <p className="text-xs font-medium">哪里不好？（可多选）</p>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setTags((cur) =>
                    cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
                  )
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  tags.includes(tag)
                    ? "bg-foreground text-background border-transparent"
                    : "hover:bg-muted",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bg-foreground text-background w-full rounded-md py-1.5 text-xs font-medium"
            onClick={() => {
              void send(-1, tags);
              setOpen(false);
            }}
          >
            提交
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
