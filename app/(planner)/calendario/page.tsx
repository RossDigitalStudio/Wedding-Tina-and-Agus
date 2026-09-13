"use client";

import { ChevronLeft, ChevronRight, CalendarDays, CreditCard, ListTodo, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, Payment, Task } from "@/lib/types";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { es } from "date-fns/locale";

const blank = { title: "", description: "", date: "", time: "", event_type: "custom", category: "General", all_day: true };

type CalendarItem = { id: string; kind: "event" | "task" | "payment"; date: Date; title: string; subtitle?: string; raw?: CalendarEvent };

export default function CalendarPage() {
  const { wedding } = useWedding();
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [eventRes, taskRes, paymentRes] = await Promise.all([
      supabase.from("calendar_events").select("*").eq("wedding_id", wedding.id).order("starts_at"),
      supabase.from("tasks").select("*").eq("wedding_id", wedding.id).not("due_date", "is", null),
      supabase.from("payments").select("*").eq("wedding_id", wedding.id),
    ]);
    setEvents((eventRes.data || []) as CalendarEvent[]);
    setTasks((taskRes.data || []) as Task[]);
    setPayments((paymentRes.data || []) as Payment[]);
  }

  useEffect(() => { load(); }, [wedding.id]);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month]);

  const items = useMemo<CalendarItem[]>(() => [
    ...events.map((event) => ({ id: event.id, kind: "event" as const, date: parseISO(event.starts_at), title: event.title, subtitle: event.category, raw: event })),
    ...tasks.filter((task) => task.due_date && task.status !== "done").map((task) => ({ id: task.id, kind: "task" as const, date: parseISO(task.due_date!), title: task.title, subtitle: task.status === "in_progress" ? "En curso" : "Pendiente" })),
    ...payments.filter((payment) => !payment.paid).map((payment) => ({ id: payment.id, kind: "payment" as const, date: parseISO(payment.due_date), title: payment.concept, subtitle: "Pago pendiente" })),
  ], [events, tasks, payments]);

  function openNew(date?: Date) {
    setEditing(null);
    setDraft({ ...blank, date: format(date || new Date(), "yyyy-MM-dd") });
    setModalOpen(true);
  }

  function openEdit(event: CalendarEvent) {
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
    setSaving(true);
    const supabase = createClient();
    const startsAt = draft.all_day || !draft.time ? `${draft.date}T12:00:00-03:00` : `${draft.date}T${draft.time}:00-03:00`;
    const payload = {
      wedding_id: wedding.id,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      starts_at: startsAt,
      ends_at: null,
      all_day: draft.all_day,
      event_type: draft.event_type,
      category: draft.category,
      google_sync_state: "not_connected",
    };
    if (editing) await supabase.from("calendar_events").update(payload).eq("id", editing.id);
    else await supabase.from("calendar_events").insert(payload);
    setSaving(false);
    setModalOpen(false);
    await load();
  }

  async function remove() {
    if (!editing || !confirm(`¿Eliminar “${editing.title}”?`)) return;
    const supabase = createClient();
    await supabase.from("calendar_events").delete().eq("id", editing.id);
    setModalOpen(false);
    await load();
  }

  function chip(item: CalendarItem) {
    const style = item.kind === "payment" ? "bg-[var(--burgundy-soft)] text-[var(--burgundy)]" : item.kind === "task" ? "bg-amber-100 text-amber-800" : "bg-[var(--moss-soft)] text-[var(--moss-dark)]";
    const Icon = item.kind === "payment" ? CreditCard : item.kind === "task" ? ListTodo : CalendarDays;
    return (
      <button key={`${item.kind}-${item.id}`} onClick={() => item.raw && openEdit(item.raw)} disabled={!item.raw} className={`flex w-full items-center gap-1.5 truncate rounded-lg px-2 py-1 text-left text-[11px] font-medium ${style}`} title={item.title}>
        <Icon size={11} className="shrink-0" /><span className="truncate">{item.title}</span>
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Vista mensual" title="Calendario" description="Eventos propios, fechas límite de pendientes y vencimientos de pagos aparecen juntos. Está preparado para sincronización futura con Google Calendar." actions={<Button onClick={() => openNew()}><Plus size={17} /> Agregar evento</Button>} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={17} /></Button><Button variant="secondary" size="sm" onClick={() => setMonth(new Date())}>Hoy</Button><Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={17} /></Button></div>
          <h2 className="font-serif text-2xl capitalize">{format(month, "MMMM yyyy", { locale: es })}</h2>
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--moss-soft)] px-2.5 py-1 text-[var(--moss-dark)]">Eventos</span><span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Pendientes</span><span className="rounded-full bg-[var(--burgundy-soft)] px-2.5 py-1 text-[var(--burgundy)]">Pagos</span></div>
        </div>

        <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--cream-2)] text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-xs">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day} className="px-1 py-2.5">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayItems = items.filter((item) => isSameDay(item.date, day));
            return (
              <div key={day.toISOString()} onDoubleClick={() => openNew(day)} className={`min-h-24 border-b border-r border-[var(--line)] p-1.5 sm:min-h-32 sm:p-2 ${isSameMonth(day, month) ? "bg-white" : "bg-neutral-50 text-neutral-400"}`}>
                <div className="mb-1 flex items-center justify-between"><button onClick={() => openNew(day)} className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isSameDay(day, new Date()) ? "bg-[var(--ink)] text-white" : "hover:bg-[var(--cream-2)]"}`}>{format(day, "d")}</button></div>
                <div className="space-y-1">{dayItems.slice(0, 4).map(chip)}{dayItems.length > 4 ? <div className="px-1 text-[10px] text-[var(--muted)]">+{dayItems.length - 4} más</div> : null}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar evento" : "Nuevo evento"}>
        <form onSubmit={save} className="grid gap-4">
          <Field label="Título"><Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ej. Reunión con decoración" /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha"><Input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field><Field label="Hora" hint="Dejala vacía para eventos de todo el día"><Input type="time" disabled={draft.all_day} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.all_day} onChange={(e) => setDraft({ ...draft, all_day: e.target.checked })} /> Todo el día</label>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo"><Select value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value })}><option value="custom">Personalizado</option><option value="appointment">Reunión / turno</option><option value="milestone">Hito</option><option value="payment">Pago</option></Select></Field><Field label="Categoría"><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field></div>
          <Field label="Descripción"><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          {editing ? <div className="rounded-xl bg-[var(--cream-2)] p-3 text-xs text-[var(--muted)]">Google Calendar: {editing.google_sync_state === "synced" ? "sincronizado" : "todavía no conectado"}. El campo de vínculo ya está reservado para la integración.</div> : null}
          <div className="flex justify-between gap-2"><div>{editing ? <Button type="button" variant="danger" onClick={remove}><Trash2 size={16} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : editing ? <Pencil size={16} /> : null} Guardar</Button></div></div>
        </form>
      </Modal>
    </div>
  );
}
