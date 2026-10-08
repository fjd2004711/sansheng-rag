"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, FileText, GitBranch, ShieldCheck, Workflow } from "lucide-react";

import report from "../../../public/evaluation/p5-report.json";
import { ROUTES } from "@/lib/constants";

const SAMPLES = [
  {
    question: "Atlas 合规发布前需要什么凭证？",
    answer: "CRIMSON-SEAL 凭证",
    detail: "Atlas 合规发布前必须具备 CRIMSON-SEAL 凭证。",
  },
  {
    question: "Orion 恢复数据库时必须使用什么代码？",
    answer: "ORION-RECOVER-17",
    detail: "Orion 数据库恢复必须使用 ORION-RECOVER-17。",
  },
];

const TRACE = [
  { step: "问题分析", status: "PASS", note: "识别问题实体和目标字段" },
  { step: "检索 Round 1", status: "FAIL", note: "当前证据不足" },
  { step: "失败诊断", status: "FAIL", note: "定位缺失信息" },
  { step: "查询改写", status: "PASS", note: "生成更聚焦的检索问题" },
  { step: "检索 Round 2", status: "PASS", note: "找到直接证据" },
  { step: "回答验证", status: "PASS", note: "Claim、Evidence、Citation 覆盖完整" },
];

const metricOf = (mode: string, metric: string) => {
  const value = report.modes.find((m) => m.name === mode)?.metrics[metric as keyof (typeof report.modes)[number]["metrics"]];
  return typeof value === "number" ? value.toFixed(2) : "—";
};

const METRICS = [
  { label: "Baseline RAG · Recall@5", value: metricOf("Baseline RAG", "Recall@5") },
  { label: "Corrective RAG · Recall@5", value: metricOf("Corrective RAG", "Recall@5") },
  { label: "Full · Groundedness", value: metricOf("Full Self-Correcting RAG", "Groundedness") },
  { label: "Full · 拒答准确率", value: metricOf("Full Self-Correcting RAG", "Abstention Accuracy") },
];

export function RagShowcase() {
  const [index, setIndex] = useState(0);
  const sample = SAMPLES[index]!;

  return (
    <main id="main" className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <header className="flex items-center justify-between gap-3 border-b border-slate-700 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300 text-slate-950">
              <Workflow className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-[.18em] text-cyan-300">SELF-CORRECTING RAG</p>
              <h1 className="text-lg font-bold">可解释自纠错 RAG Agent</h1>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link href={ROUTES.LOGIN} className="rounded-lg px-3 py-2 text-slate-300 hover:text-white">
              登录
            </Link>
            <Link href={ROUTES.CHAT} className="flex items-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-2 font-medium text-slate-950 hover:bg-cyan-200">
              进入对话 <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        <section className="py-10">
          <p className="text-sm font-semibold text-cyan-300">LANGCHAIN · LANGGRAPH · QDRANT</p>
          <h2 className="mt-3 text-4xl leading-tight font-bold sm:text-5xl">
            每一个回答，都有证据。
            <br />
            <span className="text-cyan-300">每一次纠错，都能解释。</span>
          </h2>
          <p className="mt-5 max-w-3xl leading-7 text-slate-300">
            系统不会因为低分就重复搜索。它先判断失败原因，再选择查询改写、重检索、问题拆解、重新生成或拒答，并限制最大纠错轮数。
          </p>
          <p className="mt-3 text-xs text-slate-500">下方为固定样例演示；登录后可使用真实知识库与实时 Trace。</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {SAMPLES.map((item, i) => (
              <button
                key={item.question}
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                className={`rounded-xl border px-4 py-3 text-left text-sm ${i === index ? "border-cyan-300 bg-cyan-300/15" : "border-slate-700 bg-slate-900"}`}
              >
                {item.question}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-5 w-5 text-cyan-300" />
              最终回答
            </h3>
            <p className="mt-6 text-2xl font-bold text-cyan-200">{sample.answer}</p>
            <p className="mt-3 text-slate-300">{sample.detail}</p>
            <div className="mt-6 flex gap-2 rounded-xl bg-slate-800 p-4 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="font-medium">引用来源</p>
                <p className="mt-1 text-slate-400">知识库文件 · 页码 · 章节 · Chunk · 检索分数均可追溯</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <GitBranch className="h-5 w-5 text-cyan-300" />
              Agent 执行轨迹
            </h3>
            <ol className="mt-5 space-y-4">
              {TRACE.map((item, i) => (
                <li key={item.step} className="flex gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.status === "PASS" ? "bg-emerald-300 text-emerald-950" : "bg-amber-300 text-amber-950"}`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {item.step}{" "}
                      <span className={item.status === "PASS" ? "text-emerald-300" : "text-amber-300"}>{item.status}</span>
                    </p>
                    <p className="text-xs text-slate-400">{item.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section className="mt-5 rounded-2xl border border-cyan-300/25 bg-cyan-950/30 p-6" id="evaluation">
          <div className="grid gap-3 sm:grid-cols-4">
            {METRICS.map((item) => (
              <div key={item.label}>
                <p className="text-xs text-slate-400">{item.label}</p>
                <p className="mt-1 text-lg font-bold text-cyan-200">{item.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            数据来自评测脚本生成的报告：{report.scenario_count} 个对抗场景、{report.corpus_document_count} 份固定文档，规模有限，仅用于验证纠错链路。
          </p>
        </section>

        <footer className="flex gap-2 py-7 text-xs text-slate-500">
          <Database className="h-4 w-4" />
          本地知识库 · 混合检索 · 受限自纠错 · 可审计轨迹
        </footer>
      </div>
    </main>
  );
}
