import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-muted-foreground text-sm font-semibold tracking-wider">404</p>
      <h1 className="text-foreground mt-2 text-4xl font-bold tracking-tight">页面不存在</h1>
      <p className="text-muted-foreground mt-4">你访问的页面不存在或已被移动。</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href={ROUTES.HOME}>返回首页</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href={ROUTES.CHAT}>进入对话</Link>
        </Button>
      </div>
    </div>
  );
}
