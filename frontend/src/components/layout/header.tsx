"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { AboutSansheng } from "@/components/brand/about-sansheng";
import { Fishtail } from "@/components/brand/fishtail";
import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui";
import { useAuth } from "@/hooks";
import { useActiveRoute } from "@/lib/active-route";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { cn, isAppAdmin } from "@/lib/utils";

import { NAV } from "./nav";


export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const isActive = useActiveRoute();
  const t = useTranslations("nav");

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 border-foreground/55 sticky top-0 z-40 w-full border-b-[3px] border-double backdrop-blur md:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href={ROUTES.HOME} className="flex items-center gap-2">
            <Fishtail size={28} />
            <span className="font-display hidden text-lg font-bold tracking-[0.2em] sm:inline">{APP_NAME}</span>
          </Link>
          <AboutSansheng className="text-muted-foreground hover:text-foreground -ml-1 hidden rounded-md p-1 sm:inline-flex" />

          <nav className="flex items-center gap-0.5" aria-label="主导航">
            {NAV.filter((item) => !("adminOnly" in item) || isAppAdmin(user)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                aria-label={t(item.key)}
                title={t(item.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-none p-2 text-sm font-medium transition-colors sm:px-3 sm:py-1.5",
                  isActive(item.href)
                    ? "text-foreground shadow-[inset_0_-2px_0_var(--color-brand)]"
                    : "text-muted-foreground hover:text-foreground",
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
