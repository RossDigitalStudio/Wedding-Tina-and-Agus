"use client";

import { ArrowRight, CalendarClock, CalendarDays, CheckCircle2, CircleDollarSign, Heart, Loader2, PartyPopper, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { createClient } from "@/lib/supabase/client";
import type { GuestInvitation, Payment, Task } from "@/lib/types";
import { currency } from "@/lib/utils";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type Summary = { guestCount: number; invitations: GuestInvitation[]; tasks: Task[]; payments: Payment[] };

export default function DashboardPage() {
  const { wedding } = useWedding();
  const [data, setData] = useState<Summary>({ guestCount: 0, invitations: [], tasks: [], payments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const supabase = createClient();
        const [guests, invitations, tasks, payments] = await Promise.all([
          supabase.from("guests").select("id", { count: "exact", head: true }).eq("wedding_id", wedding.id),
          supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id),
          supabase.from("tasks").select("*").eq("wedding_id", wedding.id).order("due_date", { ascending: true, nullsFirst: false }),
          supabase.from("payments").select("*").eq("wedding_id", wedding.id).order("due_date", { ascending: true }),
        ]);
        if ([guests, invitations, tasks, payments].some((result) => result.error)) throw new Error("load");
        if (active) setData({ guestCount: guests.count || 0, invitations: (invitations.data || []) as GuestInvitation[], tasks: (tasks.data || []) as Task[], payments: (payments.data || []) as Payment[] });
      } catch {
        if (active) setError("No pudimos actualizar el resumen. Intentá nuevamente.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void Promise.resolve().then(load);
    return () => { active = false; };
  }, [wedding.id, reload]);

  const now = new Date();
  const daysToParty = differenceInCalendarDays(parseISO(wedding.ceremony_date), now);
  const taskDone = data.tasks.filter((task) => task.status === "done").length;
  const taskProgress = data.tasks.length ? Math.round((taskDone / data.tasks.length) * 100) : 0;
  const partyInvites = data.invitations.filter((i) => i.event_type === "party" && i.invited);
  const partyConfirmed = partyInvites.filter((i) => i.rsvp === "confirmed").length;
  const pendingPayments = data.payments.filter((p) => !p.paid);
  const upcomingTasks = data.tasks.filter((task) => task.status !== "done").slice(0, 4);
  const upcomingPayments = pendingPayments.slice(0, 3);
  const overdue = (date: string | null) => !!date && differenceInCalendarDays(parseISO(date), now) < 0;
  const overdueCount = data.tasks.filter((task) => task.status !== "done" && overdue(task.due_date)).length + pendingPayments.filter((payment) => overdue(payment.due_date)).length;
  const stats = [
    { href: "/invitados", icon: Users, label: "Invitados", value: data.guestCount, detail: `Meta: ${wedding.guest_target}` },
    { href: "/invitados", icon: PartyPopper, label: "Confirmados", value: partyConfirmed, detail: `De ${partyInvites.length} invitados a la fiesta` },
    { href: "/pendientes", icon: CheckCircle2, label: "Tareas hechas", value: `${taskDone}/${data.tasks.length}`, detail: `${taskProgress}% del plan` },
    { href: "/presupuesto", icon: CircleDollarSign, label: "Pagos por hacer", value: pendingPayments.length, detail: "Ver próximos vencimientos" },
  ];
  const shortcutStyle = "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-medium transition hover:bg-[var(--moss-soft)] focus-visible:outline-2 focus-visible:outline-[var(--moss)]";

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader eyebrow="Un paso más cerca" title="Nuestro gran día" description="Todo lo que estamos preparando, con amor y a nuestro ritmo." />

      <Card className="relative overflow-hidden border-[var(--moss-dark)] bg-[var(--ink)] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--moss)]/25 blur-3xl" />
        <div className="relative grid min-w-0 grid-cols-1 gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-[#c7d1b7]"><Heart size={14} fill="currentColor" /> Nuestra historia, nuestro día</p>
            <h2 className="mt-3 break-words font-serif text-3xl sm:text-4xl">{wedding.partner_one_name} & {wedding.partner_two_name}</h2>
            <p className="mt-3 text-sm text-white/75">{daysToParty > 0 ? <>Faltan <strong className="font-serif text-3xl font-normal text-[#c7d1b7]">{daysToParty}</strong> días para celebrar</> : daysToParty === 0 ? "Hoy es nuestro gran día" : "Un día para recordar siempre"}</p>
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-white/60"><PartyPopper size={14} className="mt-0.5 shrink-0" /><span className="break-words">{wedding.reception_name || "ART Event Center"}{wedding.reception_address ? ` · ${wedding.reception_address}` : ""}</span></p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            {[{ label: "Civil", date: wedding.civil_date }, { label: "Iglesia y fiesta", date: wedding.ceremony_date }].map(({ label, date }) => <div key={label} className="min-w-0 rounded-2xl border border-white/15 bg-white/5 p-3 sm:p-4">
              <p className="text-xs text-[#c7d1b7]">{label}</p><p className="mt-2 font-serif text-3xl">{format(parseISO(date), "d")}</p><p className="mt-1 text-xs text-white/75">{format(parseISO(date), "MMMM yyyy", { locale: es })}</p>
            </div>)}
          </div>
        </div>
      </Card>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ href, icon: Icon, label, value, detail }) => <Link key={label} href={href} className="group min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4 transition hover:border-[var(--moss)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--moss)]">
          <div className="flex items-center justify-between gap-2"><Icon size={18} className="shrink-0 text-[var(--moss)]" /><ArrowRight size={14} className="text-[var(--muted)] transition group-hover:translate-x-1" /></div>
          <p className="mt-3 break-words text-xs font-medium text-[var(--muted)]">{label}</p><p className="mt-1 break-words text-2xl font-semibold">{loading || error ? "—" : value}</p><p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{loading ? "Actualizando…" : error ? "Datos no disponibles" : detail}</p>
        </Link>)}
      </div>

      <section aria-labelledby="next-steps" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--moss)]">Paso a paso</p><h2 id="next-steps" className="mt-1 font-serif text-2xl">Ahora nos toca…</h2></div>{!loading && !error && overdueCount > 0 ? <StatusBadge tone="burgundy">{overdueCount} {overdueCount === 1 ? "fecha vencida" : "fechas vencidas"}</StatusBadge> : null}</div>
        {error ? <Card className="p-4"><p role="alert" className="text-sm text-[var(--burgundy)]">{error}</p><Button variant="secondary" className="mt-3" onClick={() => setReload((value) => value + 1)}>Reintentar</Button></Card> : loading ? <Card className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--muted)]" role="status"><Loader2 size={18} className="animate-spin" /> Preparando nuestro resumen…</Card> : <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="min-w-0 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-serif text-xl"><CalendarClock size={18} className="text-[var(--moss)]" /> Próximos pendientes</h3><Link href="/pendientes" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--moss)]">Ver todos<ArrowRight size={13} /></Link></div>
            <div className="mt-3 space-y-2">{upcomingTasks.length ? upcomingTasks.map((task) => <Link key={task.id} href="/pendientes" className={`block min-w-0 rounded-xl border p-3 transition hover:bg-[var(--cream-2)] ${overdue(task.due_date) ? "border-[var(--burgundy)]/20 bg-[var(--burgundy-soft)]/50" : "border-[var(--line)] bg-[var(--cream)]"}`}>
              <p className="break-words text-sm font-medium">{task.title}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className={overdue(task.due_date) ? "font-semibold text-[var(--burgundy)]" : "text-[var(--muted)]"}>{task.due_date ? `${overdue(task.due_date) ? "Venció" : "Para el"} ${format(parseISO(task.due_date), "d MMM", { locale: es })}` : "Sin fecha"}</span><StatusBadge tone={task.status === "in_progress" ? "warning" : "neutral"}>{task.status === "in_progress" ? "En curso" : "Pendiente"}</StatusBadge></div>
            </Link>) : <p className="py-6 text-center text-sm text-[var(--muted)]">Todo al día. No hay pendientes abiertos.</p>}</div>
          </Card>
          <Card className="min-w-0 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-serif text-xl"><CircleDollarSign size={18} className="text-[var(--burgundy)]" /> Próximos pagos</h3><Link href="/presupuesto" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--moss)]">Ver todos<ArrowRight size={13} /></Link></div>
            <div className="mt-3 space-y-2">{upcomingPayments.length ? upcomingPayments.map((payment) => <Link key={payment.id} href="/presupuesto" className={`block min-w-0 rounded-xl border p-3 transition hover:bg-[var(--cream-2)] ${overdue(payment.due_date) ? "border-[var(--burgundy)]/20 bg-[var(--burgundy-soft)]/50" : "border-[var(--line)] bg-[var(--cream)]"}`}>
              <p className="break-words text-sm font-medium">{payment.concept}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className={`text-xs ${overdue(payment.due_date) ? "font-semibold text-[var(--burgundy)]" : "text-[var(--muted)]"}`}>{overdue(payment.due_date) ? "Venció" : "Vence"} {format(parseISO(payment.due_date), "d MMM", { locale: es })}</span><span className="break-words text-sm font-semibold">{currency(payment.amount)}</span></div>
            </Link>) : <p className="py-6 text-center text-sm text-[var(--muted)]">No hay pagos pendientes.</p>}</div>
          </Card>
        </div>}
      </section>

      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Lo que ya logramos</h2><span className="text-sm font-semibold text-[var(--moss)]">{loading || error ? "—" : `${taskProgress}%`}</span></div>
        <div role="progressbar" aria-label="Progreso de los pendientes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading || error ? undefined : taskProgress} className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--moss-soft)]"><div className="h-full rounded-full bg-[var(--moss)] transition-[width]" style={{ width: `${loading || error ? 0 : taskProgress}%` }} /></div>
        <p className="mt-2 text-xs text-[var(--muted)]">{loading || error ? "Cada paso cuenta para nuestro gran día." : `${taskDone} de ${data.tasks.length} pendientes completados. Cada paso cuenta.`}</p>
      </Card>
      <nav aria-label="Accesos rápidos" className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/calendario?new=1" className={shortcutStyle}><Plus size={16} /> Nuevo evento</Link><Link href="/pendientes" className={shortcutStyle}><CheckCircle2 size={16} /> Pendientes</Link><Link href="/invitados" className={shortcutStyle}><Users size={16} /> Invitados</Link><Link href="/calendario" className={shortcutStyle}><CalendarDays size={16} /> Agenda</Link>
      </nav>
    </div>
  );
}
