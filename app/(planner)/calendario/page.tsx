"use client";

import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, CreditCard, ListTodo, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, Payment, Task } from "@/lib/types";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, differenceInCalendarDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { currency } from "@/lib/utils";

const blank = { title: "", description: "", date: "", time: "", event_type: "custom", category: "General", all_day: true };

type CalendarItem = { id: string; kind: "event" | "task" | "payment"; date: Date; title: string; subtitle?: string; amount?: number | null; raw?: CalendarEvent };

export default function CalendarPage() {
  const { wedding } = useWedding();
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"month" | "upcoming">("month");
  const [kindFilter, setKindFilter] = useState<"all" | CalendarItem["kind"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [eventRes, taskRes, paymentRes] = await Promise.all([
        supabase.from("calendar_events").select("*").eq("wedding_id", wedding.id).order("starts_at"),
        supabase.from("tasks").select("*").eq("wedding_id", wedding.id).not("due_date", "is", null),
        supabase.from("payments").select("*").eq("wedding_id", wedding.id),
      ]);
      if ([eventRes, taskRes, paymentRes].some((result) => result.error)) throw new Error("load");
      setEvents((eventRes.data || []) as CalendarEvent[]);
      setTasks((taskRes.data || []) as Task[]);
      setPayments((paymentRes.data || []) as Payment[]);
    } catch {
      setError("No pudimos actualizar la agenda. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [wedding.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      Promise.resolve().then(() => {
        setDraft({ ...blank, date: format(new Date(), "yyyy-MM-dd") });
        setModalOpen(true);
        window.history.replaceState(window.history.state, "", window.location.pathname);
      });
    }
  }, []);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month]);

  const items = useMemo<CalendarItem[]>(() => [
    ...events.map((event) => ({ id: event.id, kind: "event" as const, date: parseISO(event.starts_at), title: event.title, subtitle: event.category, raw: event })),
    ...tasks.filter((task) => task.due_date && task.status !== "done").map((task) => ({ id: task.id, kind: "task" as const, date: parseISO(task.due_date!), title: task.title, subtitle: task.status === "in_progress" ? "En curso" : "Pendiente" })),
    ...payments.filter((payment) => !payment.paid).map((payment) => ({ id: payment.id, kind: "payment" as const, date: parseISO(payment.due_date), title: payment.concept, subtitle: "Pago pendiente", amount: payment.amount })),
  ], [events, tasks, payments]);

  const filteredItems = items.filter((item) => kindFilter === "all" || item.kind === kindFilter);
  const todayStart = startOfDay(new Date());
  const overdueItems = filteredItems.filter((item) => item.kind !== "event" && item.date < todayStart).sort((a, b) => a.date.getTime() - b.date.getTime());
  const futureItems = filteredItems.filter((item) => item.date >= todayStart).sort((a, b) => a.date.getTime() - b.date.getTime());
  const selectedItems = filteredItems.filter((item) => isSameDay(item.date, selectedDay)).sort((a, b) => a.date.getTime() - b.date.getTime());

  function selectDay(day: Date) {
    setSelectedDay(day);
    setMonth(day);
  }

  function changeMonth(direction: number) {
    selectDay(direction > 0 ? addMonths(selectedDay, 1) : subMonths(selectedDay, 1));
  }

  function openNew(date?: Date) {
    setFormError("");
    setNotice("");
    setEditing(null);
    setDraft({ ...blank, date: format(date || new Date(), "yyyy-MM-dd") });
    setModalOpen(true);
  }

  function openEdit(event: CalendarEvent) {
    setFormError("");
    setNotice("");
    const parsed = parseISO(event.starts_at);
    setEditing(event);
    setDraft({
      title: event.title,
      description: event.description || "",
      date: format(parsed, "yyyy-MM-dd"),
      time: event.all_day ? "" : format(parsed, "HH:mm"),
      event_type: event.event_type,
      category: event.category,
      all_day: event.all_day,
    });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    if (!draft.title.trim()) { setFormError("Escribí un título para el evento."); return; }
    if (!draft.all_day && !draft.time) { setFormError("Indicá la hora o marcá Todo el día."); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const startsAt = draft.all_day ? `${draft.date}T12:00:00-03:00` : `${draft.date}T${draft.time}:00-03:00`;
      const payload = { wedding_id: wedding.id, title: draft.title.trim(), description: draft.description.trim() || null, starts_at: startsAt, ends_at: null, all_day: draft.all_day, event_type: draft.event_type, category: draft.category.trim() || "General", google_sync_state: "not_connected" };
      const result = editing
        ? await supabase.from("calendar_events").update(payload).eq("id", editing.id).eq("wedding_id", wedding.id).select("id").single()
        : await supabase.from("calendar_events").insert(payload).select("id").single();
      if (result.error) throw result.error;
      setModalOpen(false);
      selectDay(parseISO(draft.date));
      setKindFilter("all");
      setView("month");
      setNotice(editing ? "Evento actualizado." : "Evento agregado a nuestra agenda.");
      await load();
    } catch {
      setFormError("No pudimos guardar el evento. Tus datos siguen acá; intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || saving || !confirm(`¿Eliminar “${editing.title}”?`)) return;
    setSaving(true);
    setFormError("");
    try {
      const supabase = createClient();
      const result = await supabase.from("calendar_events").delete().eq("id", editing.id).eq("wedding_id", wedding.id).select("id").single();
      if (result.error) throw result.error;
      setModalOpen(false);
      setNotice("Evento eliminado.");
      await load();
    } catch {
      setFormError("No pudimos eliminar el evento. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  function agendaItem(item: CalendarItem, showDate = false) {
    const Icon = item.kind === "payment" ? CreditCard : item.kind === "task" ? ListTodo : CalendarDays;
    const overdue = item.kind !== "event" && differenceInCalendarDays(item.date, new Date()) < 0;
    const label = item.kind === "payment" ? "Pago pendiente" : item.kind === "task" ? "Pendiente" : "Evento";
    const style = item.kind === "payment" ? "bg-[var(--burgundy-soft)] text-[var(--burgundy)]" : item.kind === "task" ? "bg-amber-100 text-amber-800" : "bg-[var(--moss-soft)] text-[var(--moss-dark)]";
    return <li key={`${item.kind}-${item.id}`} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 sm:p-4 ${overdue ? "border-[var(--burgundy)]/25 bg-[var(--burgundy-soft)]/30" : "border-[var(--line)]"}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style}`}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>{overdue ? <span className="text-xs font-semibold text-[var(--burgundy)]">Fecha vencida</span> : null}</div>
        <h3 className="mt-1.5 break-words text-sm font-semibold leading-relaxed">{item.title}</h3>
        {showDate ? <p className="mt-1 text-xs font-medium text-[var(--moss)]">{format(item.date, "EEEE d 'de' MMMM yyyy", { locale: es })}</p> : null}
        <p className="mt-1 break-words text-xs text-[var(--muted)]">{item.raw ? `${item.raw.all_day ? "Todo el día" : `${format(item.date, "HH:mm")} h`} · ${item.subtitle}` : item.subtitle}</p>
        {item.kind === "payment" ? <p className="mt-2 break-words text-sm font-semibold">{currency(item.amount)}</p> : null}
        {item.raw?.description ? <p className="mt-2 whitespace-pre-line break-words text-sm text-[var(--muted)]">{item.raw.description}</p> : null}
        {item.raw ? <button onClick={() => openEdit(item.raw!)} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--moss-dark)]"><Pencil size={13} /> Editar evento</button> : <Link href={item.kind === "task" ? "/pendientes" : "/presupuesto"} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--moss-dark)]">{item.kind === "task" ? "Ver pendientes" : "Ver pagos"}<ChevronRight size={14} /></Link>}
      </div>
    </li>;
  }

  function chip(item: CalendarItem) {
    const style = item.kind === "payment" ? "bg-[var(--burgundy-soft)] text-[var(--burgundy)]" : item.kind === "task" ? "bg-amber-100 text-amber-800" : "bg-[var(--moss-soft)] text-[var(--moss-dark)]";
    const Icon = item.kind === "payment" ? CreditCard : item.kind === "task" ? ListTodo : CalendarDays;
    return (
      <button key={`${item.kind}-${item.id}`} onClick={() => item.raw ? openEdit(item.raw) : selectDay(item.date)} className={`flex w-full items-center gap-1.5 truncate rounded-lg px-2 py-1 text-left text-[11px] font-medium ${style}`} title={item.title}>
        <Icon size={11} className="shrink-0" /><span className="truncate">{item.title}</span>
      </button>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader eyebrow="Cada paso hacia el gran día" title="Calendario" description="Reuniones, pendientes y pagos, en un solo lugar. Tocá una fecha para ver todos los detalles de ese día." actions={<Button onClick={() => openNew(selectedDay)}><Plus size={17} /> Agregar evento</Button>} />

      {notice ? <div role="status" className="flex items-center gap-2 rounded-xl bg-[var(--moss-soft)] p-3 text-sm text-[var(--moss-dark)]"><CheckCircle2 size={17} className="shrink-0" />{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-[var(--burgundy)]/25 bg-[var(--burgundy-soft)] p-4 text-sm text-[var(--burgundy)]">{error}<Button variant="secondary" disabled={loading} className="ml-2 mt-2" onClick={() => void load()}>Reintentar</Button></div> : null}
      <Card className="min-w-0 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-[var(--cream-2)] p-1" aria-label="Vista de la agenda">
            {([{ value: "month", label: "Mes", icon: CalendarDays }, { value: "upcoming", label: "Próximos", icon: ListTodo }] as const).map(({ value, label, icon: Icon }) => <button key={value} aria-pressed={view === value} onClick={() => setView(value)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium ${view === value ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}><Icon size={16} />{label}</button>)}
          </div>
          <div className="grid w-full grid-cols-4 gap-1.5 sm:w-auto sm:gap-2" aria-label="Filtrar actividades">
            {([{ value: "all", label: "Todo" }, { value: "event", label: "Eventos" }, { value: "task", label: "Pendientes" }, { value: "payment", label: "Pagos" }] as const).map(({ value, label }) => <button key={value} style={{ fontSize: "12px" }} aria-pressed={kindFilter === value} onClick={() => setKindFilter(value)} className={`min-h-11 rounded-full border px-2 text-xs font-semibold transition ${kindFilter === value ? "border-[var(--moss)] bg-[var(--moss)] text-white" : "border-[var(--line)] bg-white text-[var(--muted)] hover:bg-[var(--cream-2)]"}`}>{label}</button>)}
          </div>
        </div>
      </Card>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--muted)]"><Loader2 size={18} className="animate-spin" /> Actualizando nuestra agenda…</div> : error ? null : view === "upcoming" ? <Card className="min-w-0 p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--moss)]">Sin perder de vista lo importante</p><h2 className="mt-1 font-serif text-2xl">Nuestros próximos pasos</h2>
        {overdueItems.length > 0 ? <section className="mt-5"><h3 className="mb-3 text-sm font-semibold text-[var(--burgundy)]">Fechas vencidas · {overdueItems.length}</h3><ul className="space-y-3">{overdueItems.map((item) => agendaItem(item, true))}</ul></section> : null}
        <section className="mt-5"><h3 className="mb-3 text-sm font-semibold">Desde hoy · {futureItems.length}</h3>{futureItems.length ? <ul className="space-y-3">{futureItems.map((item) => agendaItem(item, true))}</ul> : <p className="rounded-xl bg-[var(--cream)] p-5 text-sm text-[var(--muted)]">No hay próximas actividades con este filtro. Podés agregar un evento o elegir otra categoría.</p>}</section>
      </Card> : <>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Button variant="secondary" className="h-11" aria-label="Mes anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></Button><Button variant="secondary" className="h-11" onClick={() => selectDay(new Date())}>Hoy</Button><Button variant="secondary" className="h-11" aria-label="Mes siguiente" onClick={() => changeMonth(1)}><ChevronRight size={17} /></Button></div>
          <h2 className="font-serif text-2xl capitalize">{format(month, "MMMM yyyy", { locale: es })}</h2>
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--moss-soft)] px-2.5 py-1 text-[var(--moss-dark)]">Eventos</span><span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Pendientes</span><span className="rounded-full bg-[var(--burgundy-soft)] px-2.5 py-1 text-[var(--burgundy)]">Pagos</span></div>
        </div>

        <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--cream-2)] text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-xs">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day} className="px-1 py-2.5">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayItems = filteredItems.filter((item) => isSameDay(item.date, day));
            const selected = isSameDay(day, selectedDay);
            const today = isSameDay(day, new Date());
            const dateLabel = `${format(day, "EEEE d 'de' MMMM", { locale: es })}, ${dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? "actividad" : "actividades"}` : "sin actividades"}${today ? ", hoy" : ""}`;
            return (
              <div key={day.toISOString()} className={`min-w-0 border-b border-r border-[var(--line)] md:min-h-32 md:p-2 ${selected ? "bg-[var(--moss-soft)] shadow-[inset_0_0_0_2px_var(--moss)]" : isSameMonth(day, month) ? "bg-white" : "bg-neutral-50 text-neutral-400"}`}>
                <button onClick={() => selectDay(day)} aria-label={dateLabel} aria-pressed={selected} aria-current={today ? "date" : undefined} className="flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--moss)] md:mb-1 md:min-h-11 md:items-start">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${selected ? "bg-[var(--moss)] text-white" : today ? "bg-[var(--ink)] text-white" : ""}`}>{format(day, "d")}</span>
                  <span aria-hidden="true" className="flex h-3 items-center gap-1 md:hidden">
                    {(["event", "task", "payment"] as const).filter((kind) => dayItems.some((item) => item.kind === kind)).map((kind) => <span key={kind} className={`h-1.5 w-1.5 rounded-full ${kind === "payment" ? "bg-[var(--burgundy)]" : kind === "task" ? "bg-amber-600" : "bg-[var(--moss)]"}`} />)}
                    {dayItems.length > 1 ? <span className="text-[9px] font-semibold text-[var(--muted)]">{dayItems.length}</span> : null}
                  </span>
                </button>
                <div className="hidden space-y-1 md:block">{dayItems.slice(0, 4).map(chip)}{dayItems.length > 4 ? <button onClick={() => selectDay(day)} className="min-h-11 px-1 text-xs text-[var(--moss-dark)]">+{dayItems.length - 4} más</button> : null}</div>
              </div>
            );
          })}
        </div>
        <a href="#day-agenda" className="flex min-h-11 items-center justify-center gap-2 bg-[var(--cream-2)] px-4 text-xs font-semibold text-[var(--moss-dark)] md:hidden">Ver agenda del día<ChevronRight size={15} className="rotate-90" /></a>
      </Card>

      <Card id="day-agenda" className="scroll-mt-24 overflow-hidden" aria-labelledby="selected-day-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--cream-2)] p-4 sm:p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--moss)]">Tu agenda del día</p>
            <h2 id="selected-day-heading" className="mt-1 font-serif text-xl capitalize sm:text-2xl">{format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{format(selectedDay, "yyyy")}{isSameDay(selectedDay, new Date()) ? " · Hoy" : ""} · {selectedItems.length ? `${selectedItems.length} ${selectedItems.length === 1 ? "actividad" : "actividades"}` : "Sin actividades"}</p>
          </div>
          <Button variant="secondary" className="h-11" onClick={() => openNew(selectedDay)}><Plus size={16} /> Agregar</Button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="p-4 sm:p-5">
          {selectedItems.length ? <ul className="space-y-3">
            {selectedItems.map((item) => agendaItem(item))}
          </ul> : <div className="py-4 text-center"><CalendarDays size={28} className="mx-auto text-[var(--moss)]" /><p className="mt-3 font-serif text-xl">Un día sin compromisos</p><p className="mt-2 text-sm text-[var(--muted)]">No hay actividades para esta fecha{kindFilter !== "all" ? " con el filtro elegido" : ""}.<br />Podés agregar un evento o elegir otro día.</p></div>}
        </div>
      </Card>

      </>}

      <Modal open={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editing ? "Editar evento" : "Nuevo evento"}>
        <form onSubmit={save} className="grid min-w-0 gap-4">
          {formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}
          <fieldset disabled={saving} className="grid min-w-0 gap-4">
          <Field label="Título"><Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ej. Reunión con decoración" /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha"><Input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field><Field label="Hora" hint="Desmarcá Todo el día para indicar una hora"><Input type="time" required={!draft.all_day} disabled={draft.all_day} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.all_day} onChange={(e) => setDraft({ ...draft, all_day: e.target.checked })} /> Todo el día</label>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo"><Select value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value })}><option value="custom">Personalizado</option><option value="appointment">Reunión / turno</option><option value="milestone">Hito</option><option value="payment">Pago</option></Select></Field><Field label="Categoría"><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field></div>
          <Field label="Descripción"><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>

          <div className="flex flex-wrap justify-between gap-2"><div>{editing ? <Button type="button" variant="danger" onClick={remove}><Trash2 size={16} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : editing ? <Pencil size={16} /> : null} Guardar</Button></div></div>
          </fieldset>
        </form>
      </Modal>
    </div>
  );
}
