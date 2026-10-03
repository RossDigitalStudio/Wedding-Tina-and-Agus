"use client";

import { Heart, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWedding } from "./wedding-context";

export function Topbar() {
  const { wedding, userEmail } = useWedding();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--cream)]/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--moss)] text-white">
            <Heart size={16} fill="currentColor" />
          </div>
          <div>
            <div className="font-serif text-lg leading-none lg:hidden">
              {wedding.partner_one_name} & {wedding.partner_two_name}
            </div>
            <div className="hidden text-sm text-[var(--muted)] lg:block">Organizando el 23 de octubre de 2027</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-[var(--muted)] sm:inline">{userEmail}</span>
          <Button
            aria-label="Abrir menú"
            aria-expanded={open}
            variant="secondary"
            size="sm"
            className="lg:hidden"
            onClick={() => setOpen(!open)}
          >
            <Menu size={17} />
          </Button>
        </div>
      </header>
      {open ? (
        <div className="absolute right-4 top-16 z-40 w-56 rounded-2xl border border-[var(--line)] bg-white p-2 shadow-xl lg:hidden">
          {[
            ["/mesas", "Mesas"],
            ["/presupuesto", "Presupuesto"],
            ["/proveedores", "Proveedores"],
            ["/documentacion", "Documentación"],
            ["/configuracion", "Configuración"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm hover:bg-[var(--cream-2)]"
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
