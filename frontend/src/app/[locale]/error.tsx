"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-destructive text-sm font-semibold tracking-wider uppercase">错误</p>
      <h1 className="text-foreground mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        出错了
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md">
        页面加载时出现问题，请重试。
      </p>
      {error.digest && (
        <p className="text-muted-foreground/60 mt-1 text-xs">错误编号：{error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>重试</Button>
        <Button variant="secondary" onClick={() => router.back()}>
          返回上一页
        </Button>
        <Button variant="outline" asChild>
          <Link href={ROUTES.HOME}>回到首页</Link>
        </Button>
      </div>
    </div>
  );
}
