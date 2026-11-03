import { Header, Rail } from "@/components/layout";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PageTransition } from "@/components/layout/page-transition";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-auto">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
