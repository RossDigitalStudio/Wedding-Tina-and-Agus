"use client";

import {
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  Images,
  LayoutDashboard,
  LogOut,
  Settings,
  Store,
  TableProperties,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useWedding } from "./wedding-context";

const items = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/pendientes", label: "Pendientes", icon: CheckSquare2 },
  { href: "/invitados", label: "Invitados", icon: Users },
  { href: "/album-admin", label: "Álbum", icon: Images },
  { href: "/mesas", label: "Mesas", icon: TableProperties },
  { href: "/presupuesto", label: "Presupuesto", icon: WalletCards },
  { href: "/proveedores", label: "Proveedores", icon: Store },
  { href: "/documentacion", label: "Documentación", icon: ClipboardList },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { wedding } = useWedding();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-white/10 bg-[var(--ink)] text-white lg:flex lg:flex-col">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">Wedding Planner</div>
        <div className="mt-2 font-serif text-2xl">{wedding.partner_one_name} & {wedding.partner_two_name}</div>
        <div className="mt-1 text-xs text-white/50">23 · 10 · 2027</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active ? "bg-white text-[var(--ink)]" : "text-white/65 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <button onClick={logout} className="m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/60 transition hover:bg-white/8 hover:text-white">
        <LogOut size={18} /> Cerrar sesión
      </button>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const visible = items.slice(0, 5);
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-white/10 bg-[var(--ink)]/95 p-1.5 text-white shadow-2xl backdrop-blur lg:hidden">
      {visible.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px]", active ? "bg-white text-[var(--ink)]" : "text-white/65")}>
            <Icon size={18} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
