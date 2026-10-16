"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck, CircleDashed, SearchX, Workflow } from "lucide-react";

import type { AnswerVerdict } from "@/lib/answer-verdict";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AnswerVerdictBarProps {
  verdict: AnswerVerdict;
  isAdmin: boolean;
  selected: boolean;
  onShowTrace?: () => void;
  onShowDetail?: () => void;
}

const TONES = {
  good: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  muted: "border-border bg-muted/40 text-muted-foreground",
} as const;

function headline(verdict: AnswerVerdict): { tone: keyof typeof TONES; icon: typeof CircleCheck; title: string; detail: string } {
  switch (verdict.kind) {
    case "verified":
      return {
        tone: "good",
        icon: CircleCheck,
        title: "已核对",
        detail: `回答中的说法都能在资料里找到依据${verdict.citations ? ` · 引用 ${verdict.citations} 处` : ""}`,
      };
    case "corrected":
      return {
        tone: "good",
        icon: CircleCheck,
        title: "纠错后通过",
        detail: `系统发现第一次的结果不理想，${verdict.rewrites ? `换了 ${verdict.rewrites} 次问法，` : ""}改正后重新核对通过`,
      };
    case "partial":
      return {
        tone: "warn",
        icon: CircleDashed,
        title: "仅部分有依据",
        detail: "资料只覆盖了问题的一部分，有依据的内容已给出，没有规定的部分已在回答里说明",
      };
    case "cross_checked": {
      const a = verdict.audit ?? {};
      const total = Object.values(a).reduce((x, y) => x + y, 0);
      const doubtful = (a.single_source ?? 0) + (a.disputed ?? 0) + (a.unverified ?? 0);
      const parts = [
        a.verified && `${a.verified} 条已核实`,
        a.single_source && `${a.single_source} 条单一来源`,
        a.disputed && `${a.disputed} 条有争议`,
        a.unverified && `${a.unverified} 条未能核实`,
      ].filter(Boolean);
      return doubtful === 0
        ? { tone: "good", icon: CircleCheck, title: "已交叉核实", detail: `${total} 条说法都有权威来源或多个独立网站印证` }
        : {
            tone: "warn",
            icon: CircleDashed,
            title: "部分说法待确认",
            detail: `${parts.join("，")}；详见回答末尾的“核实情况”`,
          };
    }
    case "abstained":
      return { tone: "warn", icon: SearchX, title: "没有找到答案", detail: "资料里没有足够依据，所以不作回答，也没有编造" };
    default:
      return { tone: "muted", icon: CircleAlert, title: "未能完成核对", detail: "这条回答没有经过完整核对，请对照来源确认" };
  }
}

export function AnswerVerdictBar({ verdict, isAdmin, selected, onShowTrace, onShowDetail }: AnswerVerdictBarProps) {
  const { tone, icon: Icon, title, detail } = headline(verdict);
  return (
    <div className="space-y-2">
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-xs", TONES[tone])}>
        <span className="flex min-w-0 flex-1 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-relaxed">
            <span className="font-semibold">{title}</span>
            <span className="text-foreground/65"> · {detail}</span>
          </span>
        </span>
        {onShowDetail && (
          <button
            type="button"
            onClick={() => {
              onShowTrace?.();
              onShowDetail();
            }}
            aria-pressed={selected}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-current/30 px-2.5 py-1 font-medium transition-colors hover:bg-foreground/5"
          >
            <Workflow className="h-3 w-3" />
            搜了什么、为什么
          </button>
        )}
      </div>

      {verdict.kind === "abstained" && (
        <div className="border-border bg-card space-y-2 rounded-xl border p-3 text-sm">
          {verdict.reason && (
            <p className="leading-relaxed">
              <span className="font-medium">为什么没有回答：</span>
              {verdict.reason}
            </p>
          )}
          <p className="font-medium">可以这样试试</p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs leading-relaxed">
            <li>换一个更具体的说法再问，比如带上文件里可能出现的名称或数字</li>
            {isAdmin ? (
              <li>
                资料库里可能确实没有这方面的内容，可以
                <Link href={ROUTES.RAG} className="text-foreground mx-0.5 font-medium underline underline-offset-2">
                  去知识库补充资料
                </Link>
              </li>
            ) : (
              <li>资料库里可能确实没有这方面的内容，可以请管理员补充相关资料</li>
            )}
          </ul>
          {verdict.queries.length > 0 && (
            <p className="text-muted-foreground text-xs">
              系统已经试过：{verdict.queries.map((query) => `「${query}」`).join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
