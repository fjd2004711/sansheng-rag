import { Header } from "@/components/layout";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PageTransition } from "@/components/layout/page-transition";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col">
        <Header />
        <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-auto px-3 pt-4 pb-4 sm:px-6 sm:pt-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </AuthGuard>
  );
}
