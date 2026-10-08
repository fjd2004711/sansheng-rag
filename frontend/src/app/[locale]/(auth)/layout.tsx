import Link from "next/link";
import { FileSearch, ShieldCheck, Workflow } from "lucide-react";

import { APP_DESCRIPTION, APP_NAME, ROUTES } from "@/lib/constants";

const POINTS = [
  { icon: FileSearch, title: "答案可查证", text: "每个说法都标明出处，点一下就能看到原文。" },
  { icon: Workflow, title: "纠错看得见", text: "找得不好会自己换个问法重找，整个过程都能展开查看。" },
  { icon: ShieldCheck, title: "查不到就直说", text: "资料里没有的内容不会编造，会告诉你为什么没答。" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen lg:grid lg:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="bg-muted/40 hidden flex-col justify-between border-r p-12 lg:flex">
        <Link href={ROUTES.HOME} className="inline-flex items-center gap-2 text-base font-bold">
          <span aria-hidden className="bg-foreground text-background inline-flex h-7 w-7 items-center justify-center rounded-md">
            <Workflow className="h-4 w-4" />
          </span>
          {APP_NAME}
        </Link>
        <div className="max-w-lg space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl leading-tight font-semibold tracking-tight">每个回答都有依据，每次纠错都看得见</h2>
            <p className="text-muted-foreground leading-relaxed">{APP_DESCRIPTION}</p>
          </div>
          <ul className="space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="bg-background flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="text-muted-foreground block text-sm leading-relaxed">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground text-xs">回答由 AI 生成，重要内容请对照来源核实。</p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center px-6 lg:hidden">
          <Link href={ROUTES.HOME} className="inline-flex items-center gap-2 text-base font-bold">
            <span aria-hidden className="bg-foreground text-background inline-flex h-6 w-6 items-center justify-center rounded-md">
              <Workflow className="h-3.5 w-3.5" />
            </span>
            {APP_NAME}
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
