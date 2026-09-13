"use client";

import { Check, CheckSquare2, CircleDot, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { format, parseISO } from "date-fns";
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

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").eq("wedding_id", wedding.id).order("due_date", { ascending: true, nullsFirst: false });
    setTasks((data || []) as Task[]);
  }

  useEffect(() => { load(); }, [wedding.id]);

  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === "open" && task.status === "done") return false;
    if (filter !== "all" && filter !== "open" && task.status !== filter) return false;
    const text = `${task.title} ${task.description || ""} ${task.category}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }), [tasks, filter, query]);

  function openNew() {
    setEditing(null);
    setDraft(emptyDraft);
    setModalOpen(true);
  }

  function openEdit(task: Task) {
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
    setSaving(true);
    const supabase = createClient();
    const payload = {
      wedding_id: wedding.id,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      status: draft.status,
      category: draft.category,
      priority: draft.priority,
      due_date: draft.due_date || null,
      linked_event_type: draft.linked_event_type || null,
    };
    if (editing) await supabase.from("tasks").update(payload).eq("id", editing.id);
    else await supabase.from("tasks").insert(payload);
    setSaving(false);
    setModalOpen(false);
    await load();
  }

  async function setStatus(task: Task, status: Task["status"]) {
    const supabase = createClient();
    await supabase.from("tasks").update({ status }).eq("id", task.id);
    await load();
  }

  async function remove(task: Task) {
    if (!confirm(`¿Eliminar “${task.title}”?`)) return;
    const supabase = createClient();
    await supabase.from("tasks").delete().eq("id", task.id);
    await load();
  }

  const counts = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Organización" title="Pendientes" description="Todo lo que hay que hacer, desde trámites hasta decoración. Cada pendiente puede tener fecha, prioridad y etapa." actions={<Button onClick={openNew}><Plus size={17} /> Nuevo pendiente</Button>} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">Pendientes</div><div className="mt-1 text-2xl font-semibold">{counts.pending}</div></Card>
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">En curso</div><div className="mt-1 text-2xl font-semibold text-amber-700">{counts.in_progress}</div></Card>
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">Hechos</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{counts.done}</div></Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pendiente..." />
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Abiertos</option>
            <option value="all">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En curso</option>
            <option value="done">Hechos</option>
          </Select>
        </div>
      </Card>

      <div className="space-y-3">
        {visible.length ? visible.map((task) => (
          <Card key={task.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={task.status === "done" ? "success" : task.status === "in_progress" ? "warning" : "neutral"}>{TASK_STATUS[task.status]}</StatusBadge>
                  <StatusBadge tone={task.priority === "high" ? "burgundy" : "moss"}>{task.priority === "high" ? "Alta" : task.priority === "low" ? "Baja" : "Media"}</StatusBadge>
                  <span className="text-xs text-[var(--muted)]">{task.category}</span>
                </div>
                <h3 className={`mt-2 font-medium ${task.status === "done" ? "text-[var(--muted)] line-through" : ""}`}>{task.title}</h3>
                {task.description ? <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{task.description}</p> : null}
                <p className="mt-2 text-xs text-[var(--muted)]">{task.due_date ? `Fecha: ${format(parseISO(task.due_date), "d 'de' MMMM 'de' yyyy", { locale: es })}` : "Sin fecha límite"}{task.linked_event_type ? ` · ${task.linked_event_type === "civil" ? "Civil" : task.linked_event_type === "church" ? "Iglesia" : "Fiesta"}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {task.status !== "pending" ? <Button variant="secondary" size="sm" onClick={() => setStatus(task, "pending")}><CircleDot size={15} /> Pendiente</Button> : null}
                {task.status !== "in_progress" ? <Button variant="secondary" size="sm" onClick={() => setStatus(task, "in_progress")}><CheckSquare2 size={15} /> En curso</Button> : null}
                {task.status !== "done" ? <Button size="sm" onClick={() => setStatus(task, "done")}><Check size={15} /> Hecho</Button> : null}
                <Button variant="ghost" size="sm" onClick={() => openEdit(task)}><Pencil size={16} /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(task)}><Trash2 size={16} /></Button>
              </div>
            </div>
          </Card>
        )) : <EmptyState icon={CheckSquare2} title="No hay pendientes para mostrar" description="Cambiá los filtros o agregá una nueva tarea." action={<Button onClick={openNew}><Plus size={16} /> Agregar</Button>} />}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar pendiente" : "Nuevo pendiente"}>
        <form onSubmit={save} className="grid gap-4">
          <Field label="Título"><Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ej. Confirmar testigos del civil" /></Field>
          <Field label="Descripción"><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estado"><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="pending">Pendiente</option><option value="in_progress">En curso</option><option value="done">Hecho</option></Select></Field>
            <Field label="Prioridad"><Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></Select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{TASK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</Select></Field>
            <Field label="Fecha límite"><Input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field>
          </div>
          <Field label="Relacionado con"><Select value={draft.linked_event_type} onChange={(e) => setDraft({ ...draft, linked_event_type: e.target.value })}><option value="">General</option><option value="civil">Civil</option><option value="church">Iglesia</option><option value="party">Fiesta</option></Select></Field>
          <div className="mt-2 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} Guardar</Button></div>
        </form>
      </Modal>
    </div>
  );
}
