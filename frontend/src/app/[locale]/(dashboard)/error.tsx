"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center py-10">
      <ErrorState
        className="w-full max-w-md"
        title="这部分内容加载失败"
        description={
          error.digest
            ? `出现了意外错误。错误编号：${error.digest}`
            : "加载时出现意外错误，请重试。"
        }
        cta={{ label: "重试", onClick: () => reset() }}
      />
    </div>
  );
}

