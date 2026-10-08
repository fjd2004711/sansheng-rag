import Link from "next/link";
import { Workflow } from "lucide-react";

import { APP_NAME, ROUTES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-6 sm:px-10">
        <Link href={ROUTES.HOME} className="inline-flex items-center gap-2 text-base font-bold">
          <span aria-hidden className="bg-foreground text-background inline-flex h-6 w-6 items-center justify-center rounded-md">
            <Workflow className="h-3.5 w-3.5" />
          </span>
          {APP_NAME}
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
