import { Suspense } from "react";

import { ReportsWorkspace } from "@/components/reports/reports-workspace";

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsWorkspace />
    </Suspense>
  );
}
