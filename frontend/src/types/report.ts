import type { ClaimLevel } from "@/lib/claims";

export type ReportStatus = "queued" | "running" | "done" | "failed";

export interface ReportSummary {
  id: string;
  topic: string;
  title: string | null;
  status: ReportStatus;
  stage: string;
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ReportClaim {
  claim: string;
  level: ClaimLevel;
  supported: boolean;
  citation_indices: number[];
  contradicting: number[];
  domains: string[];
  stale: boolean;
  reason: string;
}

export interface ReportSource {
  index: number;
  title: string;
  url: string;
  domain: string;
  tier: string;
  published_at: string | null;
  fetched_at: string;
  from_snippet: boolean;
}

export interface ReportSectionData {
  heading: string;
  body: string;
  analysis: string;
  table: { caption: string; columns: string[]; rows: string[][] } | null;
  chart: {
    title: string;
    unit: string;
    labels: string[];
    values: number[];
    sources: number[];
  } | null;
  claims: ReportClaim[];
}

export interface ReportDocument {
  title: string;
  topic: string;
  generated_at: string;
  summary: string;
  summary_claims: ReportClaim[];
  sections: ReportSectionData[];
  caveats: string[];
  method: {
    queries: string[];
    pages_read: number;
    full_text_pages: number;
    sources_by_tier: Record<string, number>;
    data_points_kept: number;
    data_points_rejected: number;
    model: string;
    started_at: string;
    finished_at: string;
  };
  sources: ReportSource[];
}

export interface ReportDetail extends ReportSummary {
  report: ReportDocument | null;
}
