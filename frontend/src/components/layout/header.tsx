"use client";

import Link from "next/link";
import { ChartNoAxesCombined, Database, FileText, LogOut, MessageSquare, Network, ShieldCheck } from "lucide-react";

import { Mascot } from "@/components/brand/mascot";
import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui";
import { useAuth } from "@/hooks";
import { useActiveRoute } from "@/lib/active-route";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { cn, isAppAdmin } from "@/lib/utils";

const NAV = [
  { key: "chat", href: ROUTES.CHAT, icon: MessageSquare },
  { key: "knowledge", href: ROUTES.RAG, icon: Database },
  { key: "reports", href: ROUTES.REPORTS, icon: FileText },
  { key: "orchestration", href: ROUTES.ORCHESTRATION, icon: Network },
  { key: "evaluation", href: ROUTES.EVALUATION, icon: ChartNoAxesCombined },
  { key: "admin", href: ROUTES.ADMIN, icon: ShieldCheck, adminOnly: true },
] as const;

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const isActive = useActiveRoute();
  const t = useTranslations("nav");

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href={ROUTES.HOME} className="flex items-center gap-2 text-sm font-bold sm:text-base">
            <Mascot size={28} lookAtPointer={false} />
            <span className="hidden sm:inline">{APP_NAME}</span>
          </Link>

          <nav className="flex items-center gap-0.5" aria-label="主导航">
            {NAV.filter((item) => !("adminOnly" in item) || isAppAdmin(user)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                aria-label={t(item.key)}
                title={t(item.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md p-2 text-sm font-medium transition-colors sm:px-3 sm:py-1.5",
                  isActive(item.href)
                    ? "bg-foreground/5 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                )}
              >
                <item.icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">{t(item.key)}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-accent h-9 w-9 rounded-lg [&_svg]:size-[1.1rem]" />
          {isAuthenticated && (
            <>
              <span className="text-muted-foreground hidden max-w-[10rem] truncate px-2 text-xs sm:inline">
                {user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={logout} className="h-9 gap-1.5 rounded-lg">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">退出</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
