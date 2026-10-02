"use client";

import { Check, CheckSquare2, CalendarClock, RotateCcw, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { TASK_CATEGORIES, TASK_STATUS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const emptyDraft = {
  title: "",
  description: "",
  status: "pending",
  category: "General",
  priority: "medium",
  due_date: "",
  linked_event_type: "",
};

export default function TasksPage() {
  const { wedding } = useWedding();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const result = await supabase.from("tasks").select("*").eq("wedding_id", wedding.id).order("due_date", { ascending: true, nullsFirst: false });
      if (result.error) throw result.error;
      setTasks((result.data || []) as Task[]);
      setError("");
    } catch { setError("No pudimos actualizar los pendientes. Intentá nuevamente."); }
    finally { setLoading(false); }
  }, [wedding.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === "open" && task.status === "done") return false;
    if (filter !== "all" && filter !== "open" && task.status !== filter) return false;
    if (category !== "all" && task.category !== category) return false;
    if (priority !== "all" && task.priority !== priority) return false;
    const text = `${task.title} ${task.description || ""} ${task.category}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])), [tasks, filter, query, category, priority]);

  function openNew() {
    setFormError("");
    setEditing(null);
    setDraft(emptyDraft);
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setFormError("");
    setEditing(task);
    setDraft({
      title: task.title,
      description: task.description || "",
      status: task.status,
      category: task.category,
      priority: task.priority,
      due_date: task.due_date || "",
      linked_event_type: task.linked_event_type || "",
    });
    setModalOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    if (!draft.title.trim()) { setFormError("Escribí un título para el pendiente."); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = { wedding_id: wedding.id, title: draft.title.trim(), description: draft.description.trim() || null, status: draft.status, category: draft.category, priority: draft.priority, due_date: draft.due_date || null, linked_event_type: draft.linked_event_type || null };
      const result = editing
        ? await supabase.from("tasks").update(payload).eq("id", editing.id).eq("wedding_id", wedding.id).select("id").single()
        : await supabase.from("tasks").insert(payload).select("id").single();
      if (result.error) throw result.error;
      setModalOpen(false);
      setNotice(editing ? "Pendiente actualizado." : "Pendiente agregado.");
      setFilter(draft.status === "done" ? "done" : "open"); setQuery(""); setCategory("all"); setPriority("all");
      await load();
    } catch { setFormError("No pudimos guardar. Tus datos siguen acá; intentá nuevamente."); }
    finally { setSaving(false); }
  }

  async function setStatus(task: Task, status: Task["status"]) {
    if (busyId) return;
    setBusyId(task.id); setError(""); setNotice("");
    try {
      const supabase = createClient();
      const result = await supabase.from("tasks").update({ status }).eq("id", task.id).eq("wedding_id", wedding.id).select("id").single();
      if (result.error) throw result.error;
      setNotice(status === "done" ? "¡Un paso más! Pendiente completado." : status === "in_progress" ? "Pendiente en curso." : "Pendiente reabierto.");
      await load();
    } catch { setError("No pudimos cambiar el estado. Intentá nuevamente."); }
    finally { setBusyId(null); }
  }

  async function remove(task: Task) {
    if (saving || !confirm(`¿Eliminar “${task.title}”?`)) return;
    setSaving(true); setFormError("");
    try {
      const supabase = createClient();
      const result = await supabase.from("tasks").delete().eq("id", task.id).eq("wedding_id", wedding.id).select("id").single();
      if (result.error) throw result.error;
      setModalOpen(false); setNotice("Pendiente eliminado."); await load();
    } catch { setFormError("No pudimos eliminar el pendiente. Intentá nuevamente."); }
    finally { setSaving(false); }
  }

  const counts = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const progress = tasks.length ? Math.round(counts.done / tasks.length * 100) : 0;
  const categories = Array.from(new Set([...TASK_CATEGORIES, ...tasks.map((task) => task.category)]));
  const groups = [
    { key: "overdue", label: "Fechas vencidas", hint: "Revisemos qué necesita una nueva fecha.", tone: "text-[var(--burgundy)]" },
    { key: "soon", label: "Próximos 7 días", hint: "Los pasos que tenemos más cerca.", tone: "text-[var(--moss)]" },
    { key: "later", label: "Más adelante", hint: "Ya podemos ir preparándolos.", tone: "text-[var(--muted)]" },
    { key: "undated", label: "Sin fecha", hint: "Ideas y tareas para ubicar en nuestra agenda.", tone: "text-[var(--muted)]" },
    { key: "done", label: "Lo que ya logramos", hint: "Cada tarea terminada cuenta.", tone: "text-[var(--moss)]" },
  ];
  function groupFor(task: Task) {
    if (task.status === "done") return "done";
    if (!task.due_date) return "undated";
    const distance = differenceInCalendarDays(parseISO(task.due_date), new Date());
    return distance < 0 ? "overdue" : distance < 7 ? "soon" : "later";
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader eyebrow="Paso a paso hacia el gran día" title="Pendientes" description="Lo que nos falta, lo que está en marcha y todo lo que ya logramos." actions={<Button className="min-h-11" onClick={openNew}><Plus size={17} /> Nuevo pendiente</Button>} />
      <Card className="overflow-hidden border-[var(--moss-dark)] bg-[var(--ink)] p-5 text-white sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-[#c7d1b7]">Nuestro avance</p><h2 className="mt-1 font-serif text-2xl">Cada paso nos acerca</h2></div><span className="font-serif text-3xl text-[#c7d1b7]">{loading || error ? "—" : `${progress}%`}</span></div>
        <div role="progressbar" aria-label="Pendientes completados" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading || error ? undefined : progress} className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#c7d1b7] transition-[width]" style={{ width: `${loading || error ? 0 : progress}%` }} /></div>
        <p className="mt-2 text-xs text-white/70">{loading || error ? "Estamos preparando nuestro resumen." : `${counts.done} de ${tasks.length} pendientes completados`}</p>
      </Card>
      <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
        {([{ key: "pending", label: "Por hacer", value: counts.pending }, { key: "in_progress", label: "En curso", value: counts.in_progress }, { key: "done", label: "Hechos", value: counts.done }]).map((item) => <button key={item.key} onClick={() => setFilter(filter === item.key ? "open" : item.key)} aria-pressed={filter === item.key} className={`min-w-0 rounded-2xl border p-3 text-left sm:p-4 ${filter === item.key ? "border-[var(--moss)] bg-[var(--moss-soft)]" : "border-[var(--line)] bg-white"}`}><span style={{ fontSize: "12px" }} className="block text-[var(--muted)]">{item.label}</span><span className="mt-1 block text-2xl font-semibold">{loading || error ? "—" : item.value}</span></button>)}
      </div>
      {notice ? <p role="status" className="rounded-xl bg-[var(--moss-soft)] p-3 text-sm text-[var(--moss-dark)]">{notice}</p> : null}
      {error ? <div role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-4 text-sm text-[var(--burgundy)]">{error}<Button disabled={loading} variant="secondary" className="mt-2" onClick={() => void load()}>Reintentar</Button></div> : null}
      <Card className="min-w-0 p-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input aria-label="Buscar pendiente" className="min-w-0 w-full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pendiente…" />
          <Select aria-label="Filtrar por estado" className="min-w-0 w-full" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="open">Abiertos</option><option value="all">Todos los estados</option><option value="pending">Por hacer</option><option value="in_progress">En curso</option><option value="done">Hechos</option></Select>
          <Select aria-label="Filtrar por categoría" className="min-w-0 w-full" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">Todas las categorías</option>{categories.map((value) => <option key={value}>{value}</option>)}</Select>
          <Select aria-label="Filtrar por prioridad" className="min-w-0 w-full" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="all">Todas las prioridades</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[var(--muted)]">{loading ? "Cargando…" : `${visible.length} ${visible.length === 1 ? "pendiente" : "pendientes"} en esta vista`}</span>{filter !== "open" || query || category !== "all" || priority !== "all" ? <button className="min-h-11 text-sm font-semibold text-[var(--moss)]" onClick={() => { setFilter("open"); setQuery(""); setCategory("all"); setPriority("all"); }}>Limpiar filtros</button> : null}</div>
      </Card>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]"><Loader2 size={18} className="animate-spin" /> Actualizando pendientes…</div> : error ? null : visible.length ? groups.map((group) => {
        const groupTasks = visible.filter((task) => groupFor(task) === group.key);
        if (!groupTasks.length) return null;
        return <section key={group.key} className="space-y-3"><div><h2 className={`flex items-center gap-2 font-serif text-xl ${group.tone}`}><CalendarClock size={17} />{group.label}<span className="rounded-full bg-white px-2 py-0.5 font-sans text-xs">{groupTasks.length}</span></h2><p className="mt-1 text-xs text-[var(--muted)]">{group.hint}</p></div>
          {groupTasks.map((task) => <Card key={task.id} className={`min-w-0 p-4 sm:p-5 ${group.key === "overdue" ? "border-[var(--burgundy)]/25" : ""}`}>
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={task.status === "done" ? "success" : task.status === "in_progress" ? "warning" : "neutral"}>{TASK_STATUS[task.status]}</StatusBadge><StatusBadge tone={task.priority === "high" ? "burgundy" : "moss"}>Prioridad {task.priority === "high" ? "alta" : task.priority === "low" ? "baja" : "media"}</StatusBadge><span className="break-words text-xs text-[var(--muted)]">{task.category}</span></div>
              <h3 className={`mt-2 break-words font-medium ${task.status === "done" ? "text-[var(--muted)] line-through" : ""}`}>{task.title}</h3>
              {task.description ? <p className="mt-1 whitespace-pre-line break-words text-sm leading-5 text-[var(--muted)]">{task.description}</p> : null}
              <p className={`mt-2 break-words text-xs ${group.key === "overdue" ? "font-semibold text-[var(--burgundy)]" : "text-[var(--muted)]"}`}>{task.due_date ? `${group.key === "overdue" ? "Venció" : "Para el"} ${format(parseISO(task.due_date), "d 'de' MMMM yyyy", { locale: es })}` : "Sin fecha límite"}{task.linked_event_type ? ` · ${task.linked_event_type === "civil" ? "Civil" : task.linked_event_type === "church" ? "Iglesia" : "Fiesta"}` : ""}</p>
            </div><div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button className="min-h-11" variant={task.status === "done" ? "secondary" : "primary"} size="sm" disabled={!!busyId} onClick={() => void setStatus(task, task.status === "done" ? "pending" : "done")}>{busyId === task.id ? <Loader2 size={15} className="animate-spin" /> : task.status === "done" ? <RotateCcw size={15} /> : <Check size={15} />}{task.status === "done" ? "Reabrir" : "Completar"}</Button>
              {task.status === "pending" ? <Button className="min-h-11" variant="secondary" size="sm" disabled={!!busyId} onClick={() => void setStatus(task, "in_progress")}>En curso</Button> : null}
              <Button className="min-h-11" variant="ghost" size="sm" disabled={!!busyId} onClick={() => openEdit(task)} aria-label={`Editar ${task.title}`}><Pencil size={16} />Editar</Button>
            </div></div>
          </Card>)}
        </section>;
      }) : <EmptyState icon={CheckSquare2} title={tasks.length ? "No hay pendientes con estos filtros" : "Nuestro plan empieza acá"} description={tasks.length ? "Probá otra categoría, prioridad o estado." : "Agregá el primer paso hacia nuestro gran día."} action={<Button onClick={openNew}><Plus size={16} /> Nuevo pendiente</Button>} />}

      <Modal open={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editing ? "Editar pendiente" : "Nuevo pendiente"}>
        <form onSubmit={save} className="grid min-w-0 gap-4">
          {formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}
          <fieldset disabled={saving} className="grid min-w-0 gap-4">
          <Field label="Título"><Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ej. Confirmar testigos del civil" /></Field>
          <Field label="Descripción"><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estado"><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="pending">Pendiente</option><option value="in_progress">En curso</option><option value="done">Hecho</option></Select></Field>
            <Field label="Prioridad"><Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></Select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</Select></Field>
            <Field label="Fecha límite"><Input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field>
          </div>
          <Field label="Relacionado con"><Select value={draft.linked_event_type} onChange={(e) => setDraft({ ...draft, linked_event_type: e.target.value })}><option value="">General</option><option value="civil">Civil</option><option value="church">Iglesia</option><option value="party">Fiesta</option></Select></Field>
          <div className="mt-2 flex flex-wrap justify-between gap-2"><div>{editing ? <Button type="button" variant="danger" onClick={() => void remove(editing)}><Trash2 size={15} />Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} Guardar</Button></div></div>
          </fieldset>
        </form>
      </Modal>
    </div>
  );
}
