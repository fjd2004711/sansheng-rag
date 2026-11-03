import Link from "next/link";

import { Fishtail } from "@/components/brand/fishtail";
import { AboutSansheng } from "@/components/brand/about-sansheng";
import { APP_NAME, APP_TAGLINE, ROUTES } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-6">
        <Link href={ROUTES.HOME} className="font-display inline-flex items-center gap-2 text-lg font-bold tracking-[0.2em]">
          {APP_NAME}
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <Fishtail size={72} />
            <p className="font-display mt-4 text-2xl font-bold tracking-[0.3em]">{APP_NAME}</p>
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
              {APP_TAGLINE}
              <AboutSansheng className="hover:text-foreground rounded-md p-0.5" />
            </p>
            <p className="text-muted-foreground font-kai mt-2 text-sm">取自唐代三省制：写的人不审，审的人不写。</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
