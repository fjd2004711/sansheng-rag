"use client";

import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import type { ReportDetail, ReportSummary } from "@/types/report";

const POLL_MS = 3000;

/** The user's reports; polls while any of them is still being generated. */
export function useReports() {
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: ReportSummary[]; total: number }>("/v1/reports");
      setItems(data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const active = items.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const create = useCallback(
    async (topic: string) => {
      const report = await apiClient.post<ReportSummary>("/v1/reports", { topic });
      await refresh();
      return report;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiClient.delete(`/v1/reports/${id}`);
      await refresh();
    },
    [refresh],
  );

  return { items, loading, active, refresh, create, remove };
}

/** One report's full content, fetched again whenever its status changes. */
export function useReport(id: string | null, status: string | undefined) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void apiClient.get<ReportDetail>(`/v1/reports/${id}`).then((data) => {
      if (!cancelled) setDetail(data);
    });
    return () => {
      cancelled = true;
    };
  }, [id, status]);
  return detail;
}
