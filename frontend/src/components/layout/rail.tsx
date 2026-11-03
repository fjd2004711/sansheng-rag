"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { AboutSansheng } from "@/components/brand/about-sansheng";
import { Fishtail } from "@/components/brand/fishtail";
import { ThemeToggle } from "@/components/theme";
import { useAuth } from "@/hooks";
import { useActiveRoute } from "@/lib/active-route";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { cn, isAppAdmin } from "@/lib/utils";

import { NAV } from "./nav";

/**
 * The desktop navigation, laid out like the block centre (版心) of a woodblock page: a narrow column down the
 * left edge with the fishtail and the book's name at the top and the section names written vertically below.
 */
export function Rail() {
  const { user, isAuthenticated, logout } = useAuth();
  const isActive = useActiveRoute();
  const t = useTranslations("nav");

  return (
    <aside className="bg-muted/55 border-foreground/45 hidden w-[72px] shrink-0 flex-col items-center border-r-[3px] border-double md:flex">
      <Link
        href={ROUTES.HOME}
        className="flex flex-col items-center gap-2 pt-5 pb-4"
        aria-label={APP_NAME}
      >
        <Fishtail size={30} />
        <span className="font-display text-base font-bold tracking-[0.35em] [writing-mode:vertical-rl]">
          {APP_NAME}
        </span>
      </Link>
      <div className="border-foreground/25 w-8 border-t" />

      <nav
        className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto py-3"
        aria-label="主导航"
      >
        {NAV.filter((item) => !("adminOnly" in item) || isAppAdmin(user)).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={t(item.key)}
              className={cn(
                "group flex w-full flex-col items-center gap-1.5 py-2.5 transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="font-display text-[15px] leading-none tracking-[0.12em] [writing-mode:vertical-rl]">
                {t(item.key)}
              </span>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  active ? "bg-brand" : "group-hover:bg-foreground/20 bg-transparent",
                )}
                aria-hidden
              />
            </Link>
          );
        })}
      </nav>

      <div className="border-foreground/25 w-8 border-t" />
      <div className="flex flex-col items-center gap-1 py-3">
        <AboutSansheng className="text-muted-foreground hover:text-foreground rounded-sm p-2" />
        <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-accent h-9 w-9 rounded-sm [&_svg]:size-4" />
        {isAuthenticated && (
          <button
            type="button"
            onClick={logout}
            title={`退出（${user?.email ?? ""}）`}
            aria-label="退出"
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-9 w-9 items-center justify-center rounded-sm"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
