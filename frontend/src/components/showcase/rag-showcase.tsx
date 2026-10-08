"use client";
import { useState } from "react";
import { CheckCircle2, Database, FileText, GitBranch, Search, ShieldCheck, Sparkles } from "lucide-react";

const samples = [
  ["Atlas 合规发布前需要什么凭证？", "CRIMSON-SEAL 凭证", "Atlas 合规发布前必须具备 CRIMSON-SEAL 凭证。"],
  ["Orion 恢复数据库时必须使用什么代码？", "ORION-RECOVER-17", "Orion 数据库恢复必须使用 ORION-RECOVER-17。"],
];

export function RagShowcase() {
  const [index, setIndex] = useState(0);
  const [question, answer, detail] = samples[index]!;
  return <main id="main" className="min-h-screen bg-[#07111f] text-slate-100">
    <div className="mx-auto max-w-6xl px-5 py-6">
      <header className="flex items-center gap-3 border-b border-slate-700 pb-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300 text-slate-950"><Sparkles className="h-5 w-5"/></span>
        <div><p className="text-xs font-bold tracking-[.18em] text-cyan-300">SELF-CORRECTING RAG</p><h1 className="text-lg font-bold">可解释自纠错 RAG Agent</h1></div>
      </header>
      <section className="py-10">
        <p className="text-sm font-semibold text-cyan-300">LANGCHAIN · LANGGRAPH · QDRANT</p>
        <h2 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">每一个回答，都有证据。<br/><span className="text-cyan-300">每一次纠错，都能解释。</span></h2>
        <p className="mt-5 max-w-3xl leading-7 text-slate-300">系统不会因为低分就重复搜索。它先判断失败原因，再选择查询改写、重检索、问题拆解、重新生成或拒答，并限制最大纠错轮数。</p>
        <div className="mt-6 flex flex-wrap gap-3">{samples.map((item, i) => <button key={item[0]} onClick={() => setIndex(i)} className={`rounded-xl border px-4 py-3 text-left text-sm ${i === index ? "border-cyan-300 bg-cyan-300/15" : "border-slate-700 bg-slate-900"}`}>{item[0]}</button>)}</div>
      </section>
      <section className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <article className="rounded-2xl border border-slate-700 bg-slate-900 p-6"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-cyan-300"/>最终回答</h3><p className="mt-6 text-2xl font-bold text-cyan-200">{answer}</p><p className="mt-3 text-slate-300">{detail}</p><div className="mt-6 rounded-xl bg-slate-800 p-4 text-sm"><div className="flex gap-2"><FileText className="h-4 w-4 text-cyan-300"/><div><p className="font-medium">引用来源</p><p className="mt-1 text-slate-400">知识库文件 · 页码 · 章节 · Chunk · 检索分数均可追溯</p></div></div></div></article>
        <article className="rounded-2xl border border-slate-700 bg-slate-900 p-6"><h3 className="flex items-center gap-2 font-semibold"><GitBranch className="h-5 w-5 text-cyan-300"/>Agent 执行轨迹</h3><ol className="mt-5 space-y-4">{[["问题分析","PASS","识别问题实体和目标字段"],["检索 Round 1","FAIL","当前证据不足"],["失败诊断","FAIL","定位缺失信息"],["查询改写","PASS","生成更聚焦的检索问题"],["检索 Round 2","PASS","找到直接证据"],["回答验证","PASS","Claim、Evidence、Citation 覆盖完整"]].map(([a,b,c], i) => <li key={a} className="flex gap-3"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${b === "PASS" ? "bg-emerald-300 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>{i+1}</span><div><p className="text-sm font-medium">{a} <span className={b === "PASS" ? "text-emerald-300" : "text-amber-300"}>{b}</span></p><p className="text-xs text-slate-400">{c}</p></div></li>)}</ol></article>
      </section>
      <section className="mt-5 grid gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-950/30 p-6 sm:grid-cols-4" id="evaluation">{[["Baseline / Hybrid","Recall@5 0.0"],["Corrective RAG","Recall@5 1.0"],["Full Self-Correcting","Groundedness 1.0"],["拒答准确率","1.0"]].map(([a,b]) => <div key={a}><p className="text-xs text-slate-400">{a}</p><p className="mt-1 text-lg font-bold text-cyan-200">{b}</p></div>)}</section>
      <footer className="flex gap-2 py-7 text-xs text-slate-500"><Database className="h-4 w-4"/>本地知识库 · 混合检索 · 受限自纠错 · 可审计轨迹</footer>
    </div>
  </main>;
}
