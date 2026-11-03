"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { MyKb } from "@/components/rag/my-kb";
import { SharedKbAdmin } from "@/components/rag/shared-kb-admin";
import { SharedKbReadonly } from "@/components/rag/shared-kb-readonly";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useAuth } from "@/hooks";
import { ROUTES } from "@/lib/constants";
import { isAppAdmin } from "@/lib/utils";
import { PageTitle } from "@/components/layout";

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const admin = isAppAdmin(user);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="border-foreground/40 flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-double pb-4">
        <div>
          <PageTitle juan="卷二" title="知识库" />
          <p className="text-muted-foreground mt-1 text-sm">
            系统只根据资料回答问题：<b>共享资料</b>人人可用，<b>我的资料</b>只有你自己能用。
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={ROUTES.CHAT}>
            <MessageSquare className="h-4 w-4" />
            去对话试试
          </Link>
        </Button>
      </header>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">我的资料</TabsTrigger>
          <TabsTrigger value="shared">{admin ? "共享资料（管理）" : "共享资料"}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="mt-4">
          <MyKb />
        </TabsContent>
        <TabsContent value="shared" className="mt-4">
          {admin ? <SharedKbAdmin /> : <SharedKbReadonly />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
