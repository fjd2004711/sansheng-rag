"use client";

import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import type { Insights, RunDetail, RunSummary, Spec, SpecValidation } from "@/types/orchestration";

const POLL_MS = 2500;

/** Which model a run uses: one for everything, and/or one per agent (by agent name). */
export interface RunModels {
  model?: string;
  agent_models?: Record<string, string>;
}

export function useSpecs() {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: Spec[] }>("/v1/orchestration/specs");
      setSpecs(data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const validate = useCallback(
    (yaml: string) => apiClient.post<SpecValidation>("/v1/orchestration/specs/validate", { yaml }),
    [],
  );
  const save = useCallback(
    async (yaml: string) => {
      const spec = await apiClient.post<Spec>("/v1/orchestration/specs", { yaml });
      await refresh();
      return spec;
    },
    [refresh],
  );
  const remove = useCallback(
    async (name: string) => {
      await apiClient.delete(`/v1/orchestration/specs/${encodeURIComponent(name)}`);
      await refresh();
    },
    [refresh],
  );
  return { specs, loading, refresh, validate, save, remove };
}

/** The user's runs; polls while any is still going. */
export function useRuns() {
  const [items, setItems] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: RunSummary[] }>("/v1/orchestration/runs");
      setItems(data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  const active = items.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const create = useCallback(
    async (spec: string, topic: string, models?: RunModels) => {
      const run = await apiClient.post<RunSummary>("/v1/orchestration/runs", {
        spec,
        topic,
        ...(models?.model ? { model: models.model } : {}),
        ...(models?.agent_models && Object.keys(models.agent_models).length
          ? { agent_models: models.agent_models }
          : {}),
      });
      await refresh();
      return run;
    },
    [refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      await apiClient.delete(`/v1/orchestration/runs/${id}`);
      await refresh();
    },
    [refresh],
  );
  const cancel = useCallback(
    async (id: string) => {
      await apiClient.post(`/v1/orchestration/runs/${id}/cancel`, {});
      await refresh();
    },
    [refresh],
  );
  return { items, loading, active, refresh, create, remove, cancel };
}

/** One run with its event log; polls while it is running so the timeline and graph move live. */
export function useRun(id: string | null) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const status = detail?.status;
  useEffect(() => {
    setDetail(null);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiClient.get<RunDetail>(`/v1/orchestration/runs/${id}`);
        if (!cancelled) setDetail(data);
      } catch {
        /* the run may have been deleted */
      }
    };
    void load();
    if (status === "done" || status === "failed") return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, status]);
  return detail;
}

export function useInsights(refreshKey: unknown) {
  const [insights, setInsights] = useState<Insights | null>(null);
  useEffect(() => {
    void apiClient
      .get<Insights>("/v1/orchestration/insights")
      .then(setInsights)
      .catch(() => setInsights(null));
  }, [refreshKey]);
  return insights;
}
