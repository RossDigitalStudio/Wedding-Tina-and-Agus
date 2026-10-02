"use client";

import { Armchair, ArrowRightLeft, Baby, CheckCircle2, Loader2, Pencil, Plus, TableProperties, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { Guest, GuestGroup, GuestInvitation, SeatingTable, TableAssignment } from "@/lib/types";

const blankTable = { name: "", capacity: "10", shape: "round", notes: "" };
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function TablesPage() {
  const { wedding } = useWedding();
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [groups, setGroups] = useState<GuestGroup[]>([]);
  const [invitations, setInvitations] = useState<GuestInvitation[]>([]);
  const [tableModal, setTableModal] = useState(false);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [editing, setEditing] = useState<SeatingTable | null>(null);
  const [draft, setDraft] = useState(blankTable);
  const [selectedGuest, setSelectedGuest] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [guestQuery, setGuestQuery] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const results = await Promise.all([
        supabase.from("seating_tables").select("*").eq("wedding_id", wedding.id).order("sort_order").order("name"),
        supabase.from("table_assignments").select("*").eq("wedding_id", wedding.id),
        supabase.from("guests").select("*").eq("wedding_id", wedding.id).order("last_name").order("first_name"),
        supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id).eq("event_type", "party"),
        supabase.from("guest_groups").select("*").eq("wedding_id", wedding.id).order("name"),
      ]);
      if (results.some((result) => result.error)) throw new Error("load");
      setTables((results[0].data || []) as SeatingTable[]); setAssignments((results[1].data || []) as TableAssignment[]); setGuests((results[2].data || []) as Guest[]); setInvitations((results[3].data || []) as GuestInvitation[]); setGroups((results[4].data || []) as GuestGroup[]); setError("");
    } catch { setError("No pudimos actualizar las mesas. Intentá nuevamente."); }
    finally { setLoading(false); }
  }, [wedding.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const guestById = useMemo(() => new Map(guests.map((guest) => [guest.id, guest])), [guests]);
  const tableById = useMemo(() => new Map(tables.map((table) => [table.id, table])), [tables]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const invitationByGuest = useMemo(() => new Map(invitations.map((invitation) => [invitation.guest_id, invitation])), [invitations]);
  const assignmentByGuest = useMemo(() => new Map(assignments.map((assignment) => [assignment.guest_id, assignment])), [assignments]);
  const partyGuests = guests.filter((guest) => { const invitation = invitationByGuest.get(guest.id); return invitation?.invited && invitation.rsvp !== "declined"; });
  const unassigned = partyGuests.filter((guest) => !assignmentByGuest.has(guest.id));
  const confirmedGuests = partyGuests.filter((guest) => invitationByGuest.get(guest.id)?.rsvp === "confirmed");
  const needsReview = assignments.filter((assignment) => { const invitation = invitationByGuest.get(assignment.guest_id); return !invitation?.invited || invitation.rsvp === "declined"; });
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
  const seatedPartyGuests = partyGuests.length - unassigned.length;
  const progress = partyGuests.length ? Math.round(seatedPartyGuests / partyGuests.length * 100) : 0;
  const name = (guest: Guest) => `${guest.first_name} ${guest.last_name}`;
  const occupancy = (tableId: string) => assignments.filter((assignment) => assignment.table_id === tableId).length;
  const matchesGuest = (guest: Guest, text: string) => normalize(`${name(guest)} ${groupById.get(guest.group_id || "") || ""}`).includes(normalize(text));
  const availableGuests = partyGuests.filter((guest) => (!confirmedOnly || invitationByGuest.get(guest.id)?.rsvp === "confirmed" || guest.id === selectedGuest) && (matchesGuest(guest, guestQuery) || guest.id === selectedGuest));
  const filteredUnassigned = unassigned.filter((guest) => matchesGuest(guest, guestQuery) && (!confirmedOnly || invitationByGuest.get(guest.id)?.rsvp === "confirmed"));
  const visibleTables = tables.filter((table) => (tableFilter === "all" || tableFilter === "free" && occupancy(table.id) < table.capacity || tableFilter === "full" && occupancy(table.id) >= table.capacity) && normalize(`${table.name} ${table.notes || ""} ${assignments.filter((assignment) => assignment.table_id === table.id).map((assignment) => { const guest = guestById.get(assignment.guest_id); return guest ? name(guest) : ""; }).join(" ")}`).includes(normalize(query)));

  function openNew() { setFormError(""); setEditing(null); setDraft(blankTable); setTableModal(true); }
  function openEdit(table: SeatingTable) { setFormError(""); setEditing(table); setDraft({ name: table.name, capacity: String(table.capacity), shape: table.shape, notes: table.notes || "" }); setTableModal(true); }
  function openPlacement(tableId = "", guestId = "") { setFormError(""); setSelectedGuest(guestId); setSelectedTable(tableId); setGuestQuery(""); setPlacementOpen(true); }

  async function saveTable(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    const capacity = Number(draft.capacity);
    if (!draft.name.trim()) { setFormError("Escribí un nombre para la mesa."); return; }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) { setFormError("La capacidad debe ser un número entero entre 1 y 30."); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      if (editing) {
        const current = await supabase.from("table_assignments").select("id").eq("wedding_id", wedding.id).eq("table_id", editing.id);
        if (current.error) throw current.error;
        if ((current.data || []).length > capacity) { setFormError(`Esta mesa ya tiene ${current.data!.length} personas. Mové o quitá invitados antes de reducir la capacidad.`); return; }
      }
      const payload = { wedding_id: wedding.id, name: draft.name.trim(), capacity, shape: draft.shape, notes: draft.notes.trim() || null };
      const result = editing ? await supabase.from("seating_tables").update(payload).eq("id", editing.id).eq("wedding_id", wedding.id).select("id").single() : await supabase.from("seating_tables").insert(payload).select("id").single();
      if (result.error) throw result.error;
      setTableModal(false); setNotice(editing ? "Mesa actualizada." : "Mesa creada."); setQuery(""); setTableFilter("all"); await load();
    } catch { setFormError("No pudimos guardar la mesa. Tus datos siguen acá; intentá nuevamente."); }
    finally { setSaving(false); }
  }

  async function removeTable() {
    if (!editing || saving || !confirm(`¿Eliminar ${editing.name}? Sus invitados quedarán sin mesa.`)) return;
    setSaving(true); setFormError("");
    try {
      const supabase = createClient();
      const result = await supabase.from("seating_tables").delete().eq("id", editing.id).eq("wedding_id", wedding.id).select("id").single();
      if (result.error) throw result.error;
      setTableModal(false); setNotice("Mesa eliminada."); await load();
    } catch { setFormError("No pudimos eliminar la mesa. Intentá nuevamente."); }
    finally { setSaving(false); }
  }

  async function placeGuest(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !selectedGuest || !selectedTable) return;
    setSaving(true); setFormError("");
    try {
      const supabase = createClient();
      const [tableResult, assignmentResult, invitationResult] = await Promise.all([
        supabase.from("seating_tables").select("*").eq("id", selectedTable).eq("wedding_id", wedding.id).single(),
        supabase.from("table_assignments").select("*").eq("wedding_id", wedding.id),
        supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id).eq("guest_id", selectedGuest).eq("event_type", "party").single(),
      ]);
      if (tableResult.error || assignmentResult.error || invitationResult.error || !tableResult.data || !invitationResult.data) throw new Error("load");
      if (!invitationResult.data.invited || invitationResult.data.rsvp === "declined") { setFormError("Esta persona ya no figura como invitada a la fiesta. Actualizá la lista antes de asignarla."); return; }
      const freshAssignments = (assignmentResult.data || []) as TableAssignment[];
      const current = freshAssignments.find((assignment) => assignment.guest_id === selectedGuest);
      if (current?.table_id === selectedTable) { setFormError("Esta persona ya está en esa mesa. Elegí otra para moverla."); return; }
      if (freshAssignments.filter((assignment) => assignment.table_id === selectedTable).length >= tableResult.data.capacity) { setFormError("Esta mesa ya está completa. Elegí otra mesa con lugar disponible."); return; }
      const result = current
        ? await supabase.from("table_assignments").update({ table_id: selectedTable }).eq("id", current.id).eq("wedding_id", wedding.id).select("id").single()
        : await supabase.from("table_assignments").insert({ wedding_id: wedding.id, table_id: selectedTable, guest_id: selectedGuest }).select("id").single();
      if (result.error) throw result.error;
      setPlacementOpen(false); setNotice(current ? "Invitado trasladado a su nueva mesa." : "Invitado asignado a la mesa."); await load();
    } catch { setFormError("No pudimos guardar la asignación. Se conserva tu selección; intentá nuevamente."); }
    finally { setSaving(false); }
  }

  async function unassign(assignment: TableAssignment) {
    if (saving) return;
    const guest = guestById.get(assignment.guest_id);
    if (!confirm(`¿Quitar ${guest ? name(guest) : "a esta persona"} de la mesa? Podrás asignarla nuevamente.`)) return;
    setSaving(true); setNotice("");
    try {
      const supabase = createClient();
      const result = await supabase.from("table_assignments").delete().eq("id", assignment.id).eq("wedding_id", wedding.id).select("id").single();
      if (result.error) throw result.error;
      setNotice("Invitado quitado de la mesa."); await load();
    } catch { setError("No pudimos quitar a esta persona de la mesa. Intentá nuevamente."); }
    finally { setSaving(false); }
  }

  const currentAssignment = assignmentByGuest.get(selectedGuest);
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader eyebrow="Compartir la mesa, compartir el día" title="Mesas" description="Un lugar para cada invitado y una mesa donde disfrutar juntos. Organizamos a quienes vienen a la fiesta, incluso si todavía no confirmaron." actions={<Button className="min-h-11" disabled={saving} onClick={openNew}><Plus size={17} /> Nueva mesa</Button>} />
      <Card className="overflow-hidden border-[var(--moss-dark)] bg-[var(--ink)] p-5 text-white sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-[#c7d1b7]">La distribución de nuestra celebración</p><h2 className="mt-2 font-serif text-3xl">Un lugar para cada persona</h2></div><Armchair size={32} className="hidden text-[#c7d1b7] sm:block" /></div><p className="mt-3 text-sm text-white/75">{loading || error ? "Preparando la distribución…" : `${seatedPartyGuests} de ${partyGuests.length} invitados a la fiesta ya tienen mesa · ${confirmedGuests.length} confirmaron`}</p><div role="progressbar" aria-label="Invitados a la fiesta con mesa" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading || error ? undefined : progress} className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#c7d1b7]" style={{ width: `${loading || error ? 0 : progress}%` }} /></div></Card>
      <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">{[{ icon: TableProperties, label: "Mesas", value: tables.length, detail: `${totalCapacity} lugares` }, { icon: Armchair, label: "Con lugar", value: assignments.length, detail: "Personas asignadas" }, { icon: Users, label: "Sin mesa", value: unassigned.length, detail: "Por distribuir" }].map(({ icon: Icon, label, value, detail }) => <Card key={label} className="min-w-0 p-3 sm:p-4"><Icon size={18} className="text-[var(--moss)]" /><p className="mt-2 text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-2xl font-semibold">{loading || error ? "—" : value}</p><p className="mt-1 break-words text-[10px] leading-4 text-[var(--muted)]">{loading || error ? "Actualizando…" : detail}</p></Card>)}</div>
      {notice ? <p role="status" className="rounded-xl bg-[var(--moss-soft)] p-3 text-sm text-[var(--moss-dark)]">{notice}</p> : null}
      {error ? <div role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-4 text-sm text-[var(--burgundy)]">{error}<Button className="mt-2" disabled={loading} variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : null}
      {!loading && !error && needsReview.length > 0 ? <p role="status" className="rounded-xl bg-[var(--burgundy-soft)] p-4 text-sm text-[var(--burgundy)]">Hay {needsReview.length} {needsReview.length === 1 ? "lugar reservado para una persona que ya no figura como asistente" : "lugares reservados para personas que ya no figuran como asistentes"}. Revisá las mesas marcadas para liberar esos lugares.</p> : null}
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]"><Loader2 size={18} className="animate-spin" /> Actualizando nuestras mesas…</div> : error ? null : <>
        <Card className="min-w-0 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl">Todavía sin mesa · {unassigned.length}</h2><Button className="min-h-11" disabled={saving || !unassigned.length || !tables.some((table) => occupancy(table.id) < table.capacity)} variant="secondary" size="sm" onClick={() => openPlacement()}><UserPlus size={15} /> Asignar lugar</Button></div><div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><Input aria-label="Buscar persona sin mesa" className="min-w-0 w-full" value={guestQuery} onChange={(event) => setGuestQuery(event.target.value)} placeholder="Buscar nombre o familia…" /><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={confirmedOnly} onChange={(event) => setConfirmedOnly(event.target.checked)} /> Solo confirmados</label></div><div className="mt-3 flex flex-wrap gap-2">{filteredUnassigned.slice(0, 20).map((guest, index) => <button key={guest.id} disabled={saving} onClick={() => openPlacement("", guest.id)} style={{ fontSize: "12px" }} className={`min-h-11 max-w-full break-words rounded-full border border-[var(--line)] bg-[var(--cream)] px-3 py-2 text-left hover:bg-[var(--moss-soft)] ${index >= 6 ? "hidden sm:inline-block" : ""}`}>{name(guest)}</button>)}{filteredUnassigned.length > 6 ? <Button variant="ghost" disabled={saving} size="sm" onClick={() => openPlacement()}>Ver los {filteredUnassigned.length} invitados</Button> : null}{!filteredUnassigned.length ? <p className="py-2 text-sm text-[var(--muted)]">{unassigned.length ? "No hay personas con esta búsqueda o filtro." : partyGuests.length ? "Todos los invitados a la fiesta tienen mesa." : "Agregá invitados a la fiesta para organizar sus lugares."}</p> : null}</div></Card>
        <Card className="min-w-0 p-4"><div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]"><Input aria-label="Buscar mesa o invitado asignado" className="min-w-0 w-full" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar mesa o invitado asignado…" /><Select aria-label="Filtrar mesas" className="min-w-0 w-full" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}><option value="all">Todas las mesas</option><option value="free">Con lugares libres</option><option value="full">Completas</option></Select></div></Card>
        {visibleTables.length ? <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleTables.map((table) => {
          const tableAssignments = assignments.filter((assignment) => assignment.table_id === table.id);
          const full = tableAssignments.length >= table.capacity;
          return <Card key={table.id} className="min-w-0 overflow-hidden"><div className="border-b border-[var(--line)] bg-[var(--cream-2)] p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-serif text-2xl">{table.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{table.shape === "round" ? "Redonda" : table.shape === "rectangular" ? "Rectangular" : "Otra forma"}</p></div><Button className="min-h-11 shrink-0" variant="ghost" size="sm" disabled={saving} onClick={() => openEdit(table)} aria-label={`Editar ${table.name}`}><Pencil size={15} /></Button></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{tableAssignments.length} / {table.capacity} lugares</span><StatusBadge tone={full ? "burgundy" : "moss"}>{tableAssignments.length > table.capacity ? "Revisar capacidad" : full ? "Completa" : `${table.capacity - tableAssignments.length} libres`}</StatusBadge></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${full ? "bg-[var(--burgundy)]" : "bg-[var(--moss)]"}`} style={{ width: `${Math.min(100, tableAssignments.length / table.capacity * 100)}%` }} /></div>{table.notes ? <p className="mt-3 whitespace-pre-line break-words text-xs leading-5 text-[var(--muted)]">{table.notes}</p> : null}</div>
            <ul className="space-y-2 p-3">{tableAssignments.map((assignment) => { const guest = guestById.get(assignment.guest_id); const invitation = invitationByGuest.get(assignment.guest_id); const invalid = !invitation?.invited || invitation.rsvp === "declined";
              return <li key={assignment.id} className={`min-w-0 rounded-xl border p-3 ${invalid ? "border-[var(--burgundy)]/25 bg-[var(--burgundy-soft)]/40" : "border-[var(--line)] bg-[var(--cream)]"}`}><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 max-w-full break-words text-sm font-medium">{guest ? name(guest) : "Invitado sin datos"}</p>{guest?.is_child ? <Baby size={14} className="text-[var(--moss)]" /> : null}</div>{guest?.group_id ? <p className="mt-1 break-words text-xs text-[var(--muted)]">{groupById.get(guest.group_id)}</p> : null}<div className="mt-2"><StatusBadge tone={invalid ? "danger" : invitation?.rsvp === "confirmed" ? "success" : "warning"}>{invalid ? "Revisar asistencia" : invitation?.rsvp === "confirmed" ? "Confirmado" : "Por confirmar"}</StatusBadge></div>{guest?.dietary_notes ? <p className="mt-2 break-words text-xs text-[var(--burgundy)]">Alimentación: {guest.dietary_notes}</p> : null}<div className="mt-2 flex flex-wrap gap-1"><Button className="min-h-11" variant="ghost" size="sm" disabled={saving || invalid} onClick={() => openPlacement("", assignment.guest_id)}><ArrowRightLeft size={14} />Mover</Button><Button className="min-h-11" variant="ghost" size="sm" disabled={saving} onClick={() => void unassign(assignment)}><Trash2 size={14} />Quitar</Button></div></li>;
            })}{!tableAssignments.length ? <li className="py-6 text-center"><Armchair size={26} className="mx-auto text-[var(--moss)]" /><p className="mt-2 font-serif text-xl">Una mesa por compartir</p><p className="mt-1 text-xs text-[var(--muted)]">Todavía no tiene invitados.</p></li> : null}</ul><div className="border-t border-[var(--line)] p-3"><Button className="min-h-11 w-full" variant="secondary" disabled={saving || full || !unassigned.length} onClick={() => openPlacement(table.id)}><UserPlus size={15} />{full ? "Mesa completa" : "Asignar invitado"}</Button></div>
          </Card>;
        })}</div> : <EmptyState icon={TableProperties} title={tables.length ? "Sin mesas con este filtro" : "Armemos nuestras mesas"} description={tables.length ? "Probá otra búsqueda o elegí todas las mesas." : "Creá la primera mesa con la capacidad que tendrá en el salón."} action={<Button disabled={saving} onClick={openNew}><Plus size={16} /> Nueva mesa</Button>} />}
      </>}
      <Modal open={tableModal} onClose={() => { if (!saving) setTableModal(false); }} title={editing ? "Editar mesa" : "Nueva mesa"} size="sm"><form onSubmit={saveTable} className="grid min-w-0 gap-4">{formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}<fieldset disabled={saving} className="grid min-w-0 gap-4"><Field label="Nombre"><Input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Mesa 1" /></Field><div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Capacidad"><Input required type="number" min="1" max="30" step="1" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></Field><Field label="Forma"><Select value={draft.shape} onChange={(event) => setDraft({ ...draft, shape: event.target.value })}><option value="round">Redonda</option><option value="rectangular">Rectangular</option><option value="other">Otra</option></Select></Field></div><Field label="Notas"><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field><div className="flex flex-wrap justify-between gap-2"><div>{editing ? <Button type="button" variant="danger" onClick={() => void removeTable()}><Trash2 size={15} />Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setTableModal(false)}>Cancelar</Button><Button type="submit">{saving ? <Loader2 size={15} className="animate-spin" /> : null}Guardar</Button></div></div></fieldset></form></Modal>
      <Modal open={placementOpen} onClose={() => { if (!saving) setPlacementOpen(false); }} title={currentAssignment ? "Mover invitado de mesa" : "Asignar un lugar"} size="sm"><form onSubmit={placeGuest} className="grid min-w-0 gap-4">{formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}<fieldset disabled={saving} className="grid min-w-0 gap-4"><Input aria-label="Buscar invitado para asignar" className="min-w-0 w-full" value={guestQuery} onChange={(event) => setGuestQuery(event.target.value)} placeholder="Buscar nombre o familia…" /><Field label="Invitado"><Select aria-label="Invitado" required className="min-w-0 w-full" value={selectedGuest} onChange={(event) => setSelectedGuest(event.target.value)}><option value="">Seleccionar persona…</option>{availableGuests.map((guest) => { const current = assignmentByGuest.get(guest.id); return <option key={guest.id} value={guest.id}>{name(guest)} · {current ? tableById.get(current.table_id)?.name || "Con mesa" : "Sin mesa"}{invitationByGuest.get(guest.id)?.rsvp === "confirmed" ? " · Confirmado" : " · Por confirmar"}</option>; })}</Select></Field><Field label="Mesa de destino"><Select aria-label="Mesa de destino" required className="min-w-0 w-full" value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)}><option value="">Elegir mesa…</option>{tables.map((table) => <option key={table.id} value={table.id} disabled={occupancy(table.id) >= table.capacity || currentAssignment?.table_id === table.id}>{table.name} · {Math.max(0, table.capacity - occupancy(table.id))} lugares libres{currentAssignment?.table_id === table.id ? " · Mesa actual" : ""}</option>)}</Select></Field>{currentAssignment ? <p className="rounded-xl bg-[var(--cream-2)] p-3 text-xs leading-5 text-[var(--muted)]">Actualmente está en {tableById.get(currentAssignment.table_id)?.name || "otra mesa"}. Al guardar, su lugar se traslada a la mesa elegida.</p> : <p className="text-xs leading-5 text-[var(--muted)]">Cada persona ocupa un lugar, incluidos los niños. La lista incluye invitados a la fiesta que todavía no confirmaron.</p>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setPlacementOpen(false)}>Cancelar</Button><Button type="submit" disabled={!selectedGuest || !selectedTable}>{saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{currentAssignment ? "Guardar traslado" : "Asignar"}</Button></div></fieldset></form></Modal>
    </div>
  );
}
