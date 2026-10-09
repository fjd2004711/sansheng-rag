import Link from "next/link";

import { Mascot } from "@/components/brand/mascot";
import { APP_NAME, ROUTES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-6">
        <Link href={ROUTES.HOME} className="inline-flex items-center gap-2 text-base font-bold">
          {APP_NAME}
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <Mascot size={88} />
            <p className="text-muted-foreground mt-3 text-sm">查过资料再回答</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
