"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Switch,
} from "@/components/ui";
import { apiClient, ApiError } from "@/lib/api-client";

interface LLMConfig {
  configured: boolean;
  source: "custom" | "server";
  base_url: string | null;
  model: string;
  disable_thinking: boolean;
  api_key_hint: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
  latency_ms: number | null;
}

const PRESETS = [
  { name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4.1" },
  { name: "阿里百炼", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { name: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "Ollama 本地", base_url: "http://localhost:11434/v1", model: "qwen3:8b" },
];

const errorText = (error: unknown) => (error instanceof ApiError || error instanceof Error ? error.message : "操作失败");

/** Lets a user point the assistant at their own OpenAI-compatible model instead of the server default. */
export function ModelSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [disableThinking, setDisableThinking] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "reset" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((next: LLMConfig) => {
    setConfig(next);
    setBaseUrl(next.base_url ?? "");
    setModel(next.model);
    setDisableThinking(next.disable_thinking);
    setApiKey("");
  }, []);

  const load = useCallback(() => {
    apiClient.get<LLMConfig>("/v1/llm-config").then(apply).catch(() => {});
  }, [apply]);

  useEffect(load, [load]);

  const body = () => ({
    base_url: baseUrl,
    model,
    disable_thinking: disableThinking,
    ...(apiKey ? { api_key: apiKey } : {}),
  });

  const run = async (kind: "save" | "test" | "reset") => {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "test") {
        const result = await apiClient.post<TestResult>("/v1/llm-config/test", body());
        setMessage({
          ok: result.ok,
          text: result.ok ? `连接成功（${result.latency_ms} ms）` : `连接失败：${result.message}`,
        });
      } else if (kind === "save") {
        apply(await apiClient.put<LLMConfig>("/v1/llm-config", body()));
        setMessage({ ok: true, text: "已保存，下一次提问起使用你的模型" });
      } else {
        await apiClient.delete("/v1/llm-config");
        load();
        setMessage({ ok: true, text: "已恢复为系统默认模型" });
      }
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const canSubmit = !!baseUrl.trim() && !!model.trim() && (!!apiKey || !!config?.configured);
  const label = config?.configured ? `模型：${config.model}` : "模型：系统默认";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex max-w-[14rem] items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
        >
          <Cpu className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>模型设置</DialogTitle>
          <DialogDescription>
            填写任何兼容 OpenAI 接口的模型。生成回答、评审资料、核对说法都会用它；你的 Key 加密保存，只用于你自己的提问。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setBaseUrl(preset.base_url);
                  setModel(preset.model);
                }}
                className="border-border hover:bg-foreground/5 rounded-full border px-2.5 py-1 text-xs transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llm-base-url">接口地址（Base URL）</Label>
            <Input id="llm-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llm-api-key">API Key</Label>
            <Input
              id="llm-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.api_key_hint ? `已保存（${config.api_key_hint}），留空则不修改` : "sk-…"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llm-model">模型名称</Label>
            <Input id="llm-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4.1" />
          </div>
          <label className="flex items-start justify-between gap-4 text-sm">
            <span>
              关闭思考模式
              <span className="text-muted-foreground block text-xs">Qwen3 等默认会“思考”的模型建议打开，否则回答很慢且可能报错</span>
            </span>
            <Switch checked={disableThinking} onCheckedChange={setDisableThinking} />
          </label>
          {message && (
            <p className={`text-xs ${message.ok ? "text-emerald-600" : "text-destructive"}`} role="status">
              {message.text}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" disabled={!config?.configured || busy !== null} onClick={() => run("reset")}>
            恢复系统默认
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!canSubmit || busy !== null} onClick={() => run("test")}>
              {busy === "test" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}测试连接
            </Button>
            <Button size="sm" disabled={!canSubmit || busy !== null} onClick={() => run("save")}>
              {busy === "save" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
