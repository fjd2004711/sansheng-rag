import {
  ChartNoAxesCombined,
  Database,
  FileText,
  MessageSquare,
  Network,
  ShieldCheck,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";

export const NAV = [
  { key: "chat", href: ROUTES.CHAT, icon: MessageSquare },
  { key: "knowledge", href: ROUTES.RAG, icon: Database },
  { key: "reports", href: ROUTES.REPORTS, icon: FileText },
  { key: "orchestration", href: ROUTES.ORCHESTRATION, icon: Network },
  { key: "evaluation", href: ROUTES.EVALUATION, icon: ChartNoAxesCombined },
  { key: "admin", href: ROUTES.ADMIN, icon: ShieldCheck, adminOnly: true },
] as const;
