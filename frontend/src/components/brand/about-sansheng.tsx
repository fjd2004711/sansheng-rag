"use client";

import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const BRANCHES = [
  {
    name: "中书省",
    role: "起草",
    who: "规划师、撰稿人、分析师",
    note: "拟提纲、写章节、给出研判与建议，只管写，不管批。",
  },
  {
    name: "门下省",
    role: "审核·封驳",
    who: "独立核查员、质量门",
    note: "重新取证、逐条分级；不达标就打回去，不让它往下走。",
  },
  {
    name: "尚书省",
    role: "执行",
    who: "调度器、检索员、修复员、主编",
    note: "排任务、跑检索、按失败类型修复，最后统稿交付。",
  },
] as const;

/** Why the product is called 三省, and how the old institution maps onto its roles. */
export function AboutSansheng({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`${APP_NAME}的由来`}
          title={`${APP_NAME}的由来`}
          className={className}
        >
          <Info className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>{APP_NAME}：{APP_TAGLINE}</DialogTitle>
          <DialogDescription className="text-foreground/80 leading-relaxed">
            名字取自唐代的三省制：中书省起草诏令，门下省审核，觉得不妥可以“封驳”退回，尚书省负责执行。
            起草的人不审核，审核的人不执行，互相制衡，才不会“自己写、自己批、自己盖章”。
            这个平台对 AI 的要求也是这样：写报告的和检查报告的不是同一个角色，检查不过关，就退回去重做。
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {BRANCHES.map((b) => (
            <li key={b.name} className="grid grid-cols-[5.5rem_1fr] gap-3 px-3 py-2.5 text-sm">
              <div>
                <div className="font-semibold">{b.name}</div>
                <div className="text-muted-foreground text-xs">{b.role}</div>
              </div>
              <div>
                <div className="font-medium">{b.who}</div>
                <div className="text-muted-foreground text-xs leading-relaxed">{b.note}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">这是一个帮助理解分工的类比，并不是对古代制度的一一复刻。</p>
      </DialogContent>
    </Dialog>
  );
}
