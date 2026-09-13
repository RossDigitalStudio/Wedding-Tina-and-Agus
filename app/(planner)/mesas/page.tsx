"use client";

import { Armchair, Loader2, Pencil, Plus, TableProperties, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { StatCard } from "@/components/planner/stat-card";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Guest, GuestInvitation, SeatingTable, TableAssignment } from "@/lib/types";

const blankTable = { name: "", capacity: "10", shape: "round", notes: "" };

export default function TablesPage() {
  const { wedding } = useWedding();
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [invitations, setInvitations] = useState<GuestInvitation[]>([]);
  const [tableModal, setTableModal] = useState(false);
  const [assignModal, setAssignModal] = useState<SeatingTable | null>(null);
  const [editing, setEditing] = useState<SeatingTable | null>(null);
  const [draft, setDraft] = useState(blankTable);
  const [selectedGuest, setSelectedGuest] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [tableRes, assignmentRes, guestRes, invitationRes] = await Promise.all([
      supabase.from("seating_tables").select("*").eq("wedding_id", wedding.id).order("sort_order").order("name"),
      supabase.from("table_assignments").select("*").eq("wedding_id", wedding.id),
      supabase.from("guests").select("*").eq("wedding_id", wedding.id).order("last_name").order("first_name"),
      supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id).eq("event_type", "party"),
    ]);
    setTables((tableRes.data || []) as SeatingTable[]);
    setAssignments((assignmentRes.data || []) as TableAssignment[]);
    setGuests((guestRes.data || []) as Guest[]);
    setInvitations((invitationRes.data || []) as GuestInvitation[]);
  }

  useEffect(() => { load(); }, [wedding.id]);

  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const assignedGuestIds = useMemo(() => new Set(assignments.map((a) => a.guest_id)), [assignments]);
  const partyGuests = useMemo(() => {
    const invitedIds = new Set(invitations.filter((i) => i.invited && i.rsvp !== "declined").map((i) => i.guest_id));
    return guests.filter((g) => invitedIds.has(g.id));
  }, [guests, invitations]);
  const unassigned = useMemo(() => partyGuests.filter((g) => !assignedGuestIds.has(g.id)), [partyGuests, assignedGuestIds]);
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);

  function openNew() { setEditing(null); setDraft(blankTable); setTableModal(true); }
  function openEdit(table: SeatingTable) { setEditing(table); setDraft({ name: table.name, capacity: String(table.capacity), shape: table.shape, notes: table.notes || "" }); setTableModal(true); }

  async function saveTable(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const supabase = createClient();
    const payload = { wedding_id: wedding.id, name: draft.name.trim(), capacity: Number(draft.capacity) || 10, shape: draft.shape, notes: draft.notes.trim() || null };
    if (editing) await supabase.from("seating_tables").update(payload).eq("id", editing.id); else await supabase.from("seating_tables").insert(payload);
    setSaving(false); setTableModal(false); await load();
  }

  async function removeTable() {
    if (!editing || !confirm(`¿Eliminar ${editing.name}? Los invitados quedarán sin mesa.`)) return;
    const supabase = createClient(); await supabase.from("seating_tables").delete().eq("id", editing.id); setTableModal(false); await load();
  }

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (!assignModal || !selectedGuest) return;
    const supabase = createClient();
    const { error } = await supabase.from("table_assignments").insert({ wedding_id: wedding.id, table_id: assignModal.id, guest_id: selectedGuest });
    if (error) alert(error.message);
    setSelectedGuest(""); setAssignModal(null); await load();
  }

  async function unassign(assignment: TableAssignment) {
    const supabase = createClient(); await supabase.from("table_assignments").delete().eq("id", assignment.id); await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Organización de la fiesta" title="Mesas" description="Armá las mesas y asigná invitados. La lista toma a quienes están invitados a la fiesta y excluye a quienes marcaron que no asisten." actions={<Button onClick={openNew}><Plus size={17} /> Nueva mesa</Button>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={TableProperties} label="Mesas" value={tables.length} detail={`${totalCapacity} lugares configurados`} />
        <StatCard icon={Armchair} label="Asignados" value={assignments.length} detail="Personas con mesa" />
        <StatCard icon={Users} label="Sin mesa" value={unassigned.length} detail="Invitados a fiesta sin asignación" />
      </div>

      {unassigned.length ? <Card className="p-4"><p className="text-sm font-semibold">Sin mesa todavía</p><div className="mt-3 flex flex-wrap gap-2">{unassigned.slice(0, 20).map((g) => <span key={g.id} className="rounded-full bg-[var(--cream-2)] px-3 py-1.5 text-xs">{g.first_name} {g.last_name}</span>)}{unassigned.length > 20 ? <span className="px-2 py-1.5 text-xs text-[var(--muted)]">+{unassigned.length - 20} más</span> : null}</div></Card> : null}

      {tables.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tables.map((table) => {
        const tableAssignments = assignments.filter((a) => a.table_id === table.id);
        const full = tableAssignments.length >= table.capacity;
        return (
          <Card key={table.id} className="overflow-hidden">
            <div className="flex items-start justify-between border-b border-[var(--line)] bg-[var(--cream-2)] p-4"><div><h2 className="font-serif text-2xl">{table.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{table.shape === "round" ? "Redonda" : table.shape === "rectangular" ? "Rectangular" : "Otra"} · {tableAssignments.length}/{table.capacity} lugares</p></div><Button variant="ghost" size="sm" onClick={() => openEdit(table)}><Pencil size={15} /></Button></div>
            <div className="min-h-40 p-3"><div className="space-y-1.5">{tableAssignments.map((assignment) => {
              const guest = guestById.get(assignment.guest_id);
              return <div key={assignment.id} className="flex items-center justify-between rounded-xl bg-[var(--cream)] px-3 py-2 text-sm"><span>{guest ? `${guest.first_name} ${guest.last_name}` : "Invitado"}</span><button onClick={() => unassign(assignment)} className="text-[var(--muted)] hover:text-red-600"><Trash2 size={14} /></button></div>;
            })}</div>{!tableAssignments.length ? <p className="py-12 text-center text-sm text-[var(--muted)]">Mesa vacía</p> : null}</div>
            <div className="border-t border-[var(--line)] p-3"><Button variant="secondary" className="w-full" disabled={full || !unassigned.length} onClick={() => { setAssignModal(table); setSelectedGuest(""); }}><UserPlus size={15} /> {full ? "Mesa completa" : "Asignar invitado"}</Button></div>
          </Card>
        );
      })}</div> : <EmptyState icon={TableProperties} title="Todavía no hay mesas" description="Podés empezar con mesas de 8, 10 o la capacidad que tenga el salón y después asignar invitados." action={<Button onClick={openNew}><Plus size={16} /> Crear primera mesa</Button>} />}

      <Modal open={tableModal} onClose={() => setTableModal(false)} title={editing ? "Editar mesa" : "Nueva mesa"} size="sm">
        <form onSubmit={saveTable} className="grid gap-4"><Field label="Nombre"><Input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Mesa 1" /></Field><div className="grid grid-cols-2 gap-4"><Field label="Capacidad"><Input required type="number" min="1" max="30" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} /></Field><Field label="Forma"><Select value={draft.shape} onChange={(e) => setDraft({ ...draft, shape: e.target.value })}><option value="round">Redonda</option><option value="rectangular">Rectangular</option><option value="other">Otra</option></Select></Field></div><Field label="Notas"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field><div className="flex justify-between"><div>{editing ? <Button type="button" variant="danger" onClick={removeTable}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setTableModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null} Guardar</Button></div></div></form>
      </Modal>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Asignar a ${assignModal?.name || "mesa"}`} size="sm">
        <form onSubmit={assign} className="grid gap-4"><Field label="Invitado"><Select required value={selectedGuest} onChange={(e) => setSelectedGuest(e.target.value)}><option value="">Seleccionar...</option>{unassigned.map((g) => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}</Select></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAssignModal(null)}>Cancelar</Button><Button type="submit">Asignar</Button></div></form>
      </Modal>
    </div>
  );
}
