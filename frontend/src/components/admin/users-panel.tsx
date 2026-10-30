"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
} from "@/components/ui";
import { useAuth } from "@/hooks";
import { apiClient } from "@/lib/api-client";
import { cn, getErrorMessage } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

export function UsersPanel() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", admin: false });

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: AdminUser[] }>("/v1/users?size=100");
      setUsers(data.items);
    } catch (error) {
      toast.error(getErrorMessage(error, "加载用户失败"));
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (target: AdminUser, body: Partial<Pick<AdminUser, "role" | "is_active">>, message: string) => {
    try {
      // Use the returned user: the server commits after replying, so an immediate re-read can be stale.
      const updated = await apiClient.patch<AdminUser>(`/v1/users/${target.id}`, body);
      setUsers((current) => current?.map((item) => (item.id === target.id ? { ...item, ...updated } : item)) ?? current);
      toast.success(message);
    } catch (error) {
      toast.error(getErrorMessage(error, "操作失败"));
    }
  };

  const create = async () => {
    try {
      const user = await apiClient.post<AdminUser>("/v1/users", {
        email: form.email.trim(),
        password: form.password,
        full_name: form.name.trim() || undefined,
        role: form.admin ? "admin" : "user",
      });
      setUsers((current) => [...(current ?? []), user]);
      toast.success("账号已创建");
      setCreating(false);
      setForm({ email: "", name: "", password: "", admin: false });
    } catch (error) {
      toast.error(getErrorMessage(error, "创建失败"));
    }
  };

  if (users === null) return <Skeleton className="h-48 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">共 {users.length} 个账号。管理员可以管理知识库和用户。</p>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" />
          创建账号
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th className="px-4 py-2.5 font-medium">账号</th>
              <th className="px-4 py-2.5 font-medium">角色</th>
              <th className="px-4 py-2.5 font-medium">状态</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">注册时间</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((item) => {
              const isMe = item.id === me?.id;
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {item.full_name || item.email.split("@")[0]}
                      {isMe && <span className="text-muted-foreground ml-1.5 text-xs font-normal">（你）</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">{item.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", item.role === "admin" && "text-emerald-700 dark:text-emerald-400")}>
                      {item.role === "admin" && <ShieldCheck className="h-3.5 w-3.5" />}
                      {item.role === "admin" ? "管理员" : "普通用户"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-medium", item.is_active ? "text-emerald-600" : "text-muted-foreground")}>{item.is_active ? "正常" : "已停用"}</span>
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 md:table-cell">{new Date(item.created_at).toLocaleDateString("zh-CN")}</td>
                  <td className="px-4 py-3">
                    <span className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isMe}
                        title={isMe ? "不能修改自己的角色" : undefined}
                        onClick={() => patch(item, { role: item.role === "admin" ? "user" : "admin" }, item.role === "admin" ? "已设为普通用户" : "已设为管理员")}
                      >
                        {item.role === "admin" ? "取消管理员" : "设为管理员"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isMe}
                        onClick={() => patch(item, { is_active: !item.is_active }, item.is_active ? "已停用" : "已启用")}
                      >
                        {item.is_active ? "停用" : "启用"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={isMe} onClick={() => setToDelete(item)}>
                        删除
                      </Button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`删除账号「${toDelete?.email ?? ""}」？`}
        description="该账号的对话记录也会一并删除，不能恢复。如果只是不想让对方使用，建议选择“停用”。"
        confirmLabel="删除"
        cancelLabel="取消"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await apiClient.delete(`/v1/users/${toDelete.id}`);
            setUsers((current) => current?.filter((item) => item.id !== toDelete.id) ?? current);
            toast.success("已删除");
          } catch (error) {
            toast.error(getErrorMessage(error, "删除失败"));
          }
          setToDelete(null);
        }}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>创建账号</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">邮箱</Label>
              <Input id="new-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">名称（选填）</Label>
              <Input id="new-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">初始密码（至少 8 位）</Label>
              <Input id="new-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.admin} onChange={(event) => setForm({ ...form, admin: event.target.checked })} />
              设为管理员
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button onClick={() => void create()} disabled={!form.email.trim() || form.password.length < 8}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
