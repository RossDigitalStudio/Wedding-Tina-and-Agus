"use client";

import { CalendarClock, CheckCircle2, CircleDollarSign, Clock3, Heart, PartyPopper, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/planner/page-header";
import { StatCard } from "@/components/planner/stat-card";
import { useWedding } from "@/components/planner/wedding-context";
import { createClient } from "@/lib/supabase/client";
import type { GuestInvitation, Payment, Task } from "@/lib/types";
import { currency } from "@/lib/utils";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type Summary = {
  guestCount: number;
  invitations: GuestInvitation[];
  tasks: Task[];
  payments: Payment[];
};

export default function DashboardPage() {
  const { wedding } = useWedding();
  const [data, setData] = useState<Summary>({ guestCount: 0, invitations: [], tasks: [], payments: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const [guests, invitations, tasks, payments] = await Promise.all([
        supabase.from("guests").select("id", { count: "exact", head: true }).eq("wedding_id", wedding.id),
        supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id),
        supabase.from("tasks").select("*").eq("wedding_id", wedding.id).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("payments").select("*").eq("wedding_id", wedding.id).order("due_date", { ascending: true }),
      ]);
      if (!active) return;
      setData({
        guestCount: guests.count || 0,
        invitations: (invitations.data || []) as GuestInvitation[],
        tasks: (tasks.data || []) as Task[],
        payments: (payments.data || []) as Payment[],
      });
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [wedding.id]);

  const daysToParty = differenceInCalendarDays(parseISO(wedding.ceremony_date), new Date());
  const taskDone = data.tasks.filter((task) => task.status === "done").length;
  const taskProgress = data.tasks.length ? Math.round((taskDone / data.tasks.length) * 100) : 0;
  const partyInvites = data.invitations.filter((i) => i.event_type === "party" && i.invited);
  const partyConfirmed = partyInvites.filter((i) => i.rsvp === "confirmed").length;
  const pendingPayments = data.payments.filter((p) => !p.paid);
  const upcomingTasks = useMemo(() => data.tasks.filter((t) => t.status !== "done").slice(0, 5), [data.tasks]);
  const upcomingPayments = useMemo(() => pendingPayments.slice(0, 4), [pendingPayments]);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="23 · 10 · 2027" title="Nuestro casamiento" description="Un resumen de lo importante: próximos pasos, invitados, pagos y progreso general." />

      <Card className="overflow-hidden bg-[var(--ink)] text-white">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80"><Heart size={14} fill="currentColor" /> Agustina & Agustín</div>
            <h2 className="mt-5 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">Faltan <span className="text-[#c7d1b7]">{Math.max(daysToParty, 0)} días</span> para la iglesia y la fiesta.</h2>
            <p className="mt-4 text-sm leading-6 text-white/60">Civil: {format(parseISO(wedding.civil_date), "d 'de' MMMM 'de' yyyy", { locale: es })} · Iglesia y fiesta: {format(parseISO(wedding.ceremony_date), "d 'de' MMMM 'de' yyyy", { locale: es })}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/8 p-4"><span className="text-xs text-white/45">Progreso</span><div className="mt-2 text-3xl font-semibold">{taskProgress}%</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#c7d1b7]" style={{ width: `${taskProgress}%` }} /></div></div>
            <div className="rounded-2xl bg-white/8 p-4"><span className="text-xs text-white/45">Meta invitados</span><div className="mt-2 text-3xl font-semibold">{wedding.guest_target}</div><div className="mt-2 text-xs text-white/45">cargados: {data.guestCount}</div></div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-xs text-white/45"><PartyPopper size={14} /> Fiesta</div><div className="mt-2 text-lg font-medium">{wedding.reception_name || "ART Event Center"}</div><div className="mt-1 text-xs text-white/45">{wedding.reception_address}</div></div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Invitados" value={loading ? "—" : data.guestCount} detail={`Objetivo aproximado: ${wedding.guest_target}`} />
        <StatCard icon={CheckCircle2} label="Tareas hechas" value={loading ? "—" : `${taskDone}/${data.tasks.length}`} detail={`${taskProgress}% del plan inicial`} />
        <StatCard icon={PartyPopper} label="Fiesta confirmados" value={loading ? "—" : `${partyConfirmed}/${partyInvites.length}`} detail="RSVP de la fiesta" />
        <StatCard icon={CircleDollarSign} label="Pagos pendientes" value={loading ? "—" : pendingPayments.length} detail="Incluye cuotas del salón" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--moss)]">Próximos pasos</p><h3 className="mt-1 font-serif text-2xl">Pendientes cercanos</h3></div><CalendarClock className="text-[var(--moss)]" size={21} /></div>
          <div className="mt-5 space-y-2">
            {upcomingTasks.length ? upcomingTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--cream)] px-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{task.due_date ? format(parseISO(task.due_date), "d MMM yyyy", { locale: es }) : "Sin fecha"} · {task.category}</p></div>
                <StatusBadge tone={task.status === "in_progress" ? "warning" : "neutral"}>{task.status === "in_progress" ? "En curso" : "Pendiente"}</StatusBadge>
              </div>
            )) : <p className="py-8 text-center text-sm text-[var(--muted)]">No hay pendientes abiertos.</p>}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--burgundy)]">Presupuesto</p><h3 className="mt-1 font-serif text-2xl">Próximos pagos</h3></div><Clock3 className="text-[var(--burgundy)]" size={21} /></div>
          <div className="mt-5 space-y-2">
            {upcomingPayments.length ? upcomingPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--cream)] px-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{payment.concept}</p><p className="mt-1 text-xs text-[var(--muted)]">Vence {format(parseISO(payment.due_date), "d MMM yyyy", { locale: es })}</p></div>
                <div className="text-right text-sm font-semibold">{currency(payment.amount)}</div>
              </div>
            )) : <p className="py-8 text-center text-sm text-[var(--muted)]">No hay pagos pendientes.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
