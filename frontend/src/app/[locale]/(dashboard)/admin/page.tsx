"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { EvalCandidatesPanel } from "@/components/admin/eval-candidates-panel";
import { InsightsPanel } from "@/components/admin/insights-panel";
import { FeedbackPanel } from "@/components/admin/feedback-panel";
import { RagSettingsPanel } from "@/components/admin/rag-settings-panel";
import { UsagePanel } from "@/components/admin/usage-panel";
import { UsersPanel } from "@/components/admin/users-panel";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useAuth } from "@/hooks";
import { ROUTES } from "@/lib/constants";
import { isAppAdmin } from "@/lib/utils";

export default function AdminPage() {
  const { user } = useAuth();

  if (user && !isAppAdmin(user)) {
    return (
      <div className="mx-auto mt-16 max-w-md px-6 text-center">
        <ShieldAlert className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
        <p className="text-sm font-medium">这个页面需要管理员权限</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={ROUTES.CHAT}>回到对话</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">管理</h1>
        <p className="text-muted-foreground mt-1 text-sm">管理账号，查看用户反馈、知识缺口和 token 用量。</p>
      </header>
      <Tabs defaultValue="feedback">
        <TabsList>
          <TabsTrigger value="feedback">用户反馈</TabsTrigger>
          <TabsTrigger value="gaps">知识缺口</TabsTrigger>
          <TabsTrigger value="eval">评测候选</TabsTrigger>
          <TabsTrigger value="params">流程参数</TabsTrigger>
          <TabsTrigger value="usage">用量</TabsTrigger>
          <TabsTrigger value="users">账号</TabsTrigger>
        </TabsList>
        <TabsContent value="feedback" className="mt-4">
          <FeedbackPanel />
        </TabsContent>
        <TabsContent value="gaps" className="mt-4">
          <InsightsPanel />
        </TabsContent>
        <TabsContent value="eval" className="mt-4">
          <EvalCandidatesPanel />
        </TabsContent>
        <TabsContent value="params" className="mt-4">
          <RagSettingsPanel />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <UsagePanel />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
