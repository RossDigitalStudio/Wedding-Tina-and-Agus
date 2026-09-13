import type { Wedding } from "@/lib/types";
import { MobileNav, Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { WeddingProvider } from "./wedding-context";

export function AppShell({ wedding, userEmail, children }: { wedding: Wedding; userEmail: string; children: React.ReactNode }) {
  return (
    <WeddingProvider value={{ wedding, userEmail }}>
      <div className="min-h-screen bg-[var(--cream)] lg:flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Topbar />
          <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
        </div>
        <MobileNav />
      </div>
    </WeddingProvider>
  );
}
