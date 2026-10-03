"use client";

import Link from "next/link";
import { TableProperties, Baby, CheckCircle2, Clock3, Loader2, Pencil, Plus, Search, Trash2, UserRoundPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { EVENT_LABELS, RSVP_STATUS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Guest, GuestGroup, GuestInvitation, TableAssignment } from "@/lib/types";

type EventKey = "civil" | "church" | "party";
type InviteDraft = Record<EventKey, { invited: boolean; rsvp: "pending" | "confirmed" | "declined" }>;

const blankInvites: InviteDraft = {
  civil: { invited: false, rsvp: "pending" },
  church: { invited: false, rsvp: "pending" },
  party: { invited: true, rsvp: "pending" },
};

const blankGuest = {
  first_name: "",
  last_name: "",
  group_id: "",
  phone: "",
  email: "",
  relationship_side: "both",
  is_child: false,
  dietary_notes: "",
  notes: "",
};

export default function GuestsPage() {
  const { wedding } = useWedding();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [groups, setGroups] = useState<GuestGroup[]>([]);
  const [invitations, setInvitations] = useState<GuestInvitation[]>([]);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [rsvpFilter, setRsvpFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [draft, setDraft] = useState(blankGuest);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(blankInvites);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState("family");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [groupError, setGroupError] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [savedGuestId, setSavedGuestId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("all");
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [guestRes, groupRes, invitationRes, assignmentRes] = await Promise.all([
        supabase.from("guests").select("*").eq("wedding_id", wedding.id).order("last_name").order("first_name"),
        supabase.from("guest_groups").select("*").eq("wedding_id", wedding.id).order("name"),
        supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id),
        supabase.from("table_assignments").select("*").eq("wedding_id", wedding.id),
      ]);
      if ([guestRes, groupRes, invitationRes, assignmentRes].some((result) => result.error)) throw new Error("load");
      setGuests((guestRes.data || []) as Guest[]); setGroups((groupRes.data || []) as GuestGroup[]); setInvitations((invitationRes.data || []) as GuestInvitation[]); setAssignments((assignmentRes.data || []) as TableAssignment[]); setError("");
    } catch { setError("No pudimos actualizar la lista de invitados. Intentá nuevamente."); }
    finally { setLoading(false); }
  }, [wedding.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const searchText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const invitationsByGuest = useMemo(() => {
    const map = new Map<string, GuestInvitation[]>();
    invitations.forEach((invitation) => map.set(invitation.guest_id, [...(map.get(invitation.guest_id) || []), invitation]));
    return map;
  }, [invitations]);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const visible = useMemo(() => guests.filter((guest) => {
    const text = searchText(`${guest.first_name} ${guest.last_name} ${groupById.get(guest.group_id || "")?.name || ""}`);
    if (!text.includes(searchText(query))) return false;
    if (groupFilter !== "all" && (groupFilter === "none" ? !!guest.group_id : guest.group_id !== groupFilter)) return false;
    if (sideFilter !== "all" && guest.relationship_side !== sideFilter) return false;
    const inv = invitationsByGuest.get(guest.id) || [];
    if (eventFilter !== "all" && !inv.some((i) => i.event_type === eventFilter && i.invited)) return false;
    if (rsvpFilter !== "all" && !inv.some((i) => i.invited && (eventFilter === "all" || i.event_type === eventFilter) && i.rsvp === rsvpFilter)) return false;
    return true;
  }), [guests, groupById, invitationsByGuest, query, eventFilter, rsvpFilter, groupFilter, sideFilter]);

  const stats = useMemo(() => ({
    total: guests.length,
    civil: invitations.filter((i) => i.event_type === "civil" && i.invited).length,
    church: invitations.filter((i) => i.event_type === "church" && i.invited).length,
    party: invitations.filter((i) => i.event_type === "party" && i.invited).length,
    confirmedParty: invitations.filter((i) => i.event_type === "party" && i.invited && i.rsvp === "confirmed").length,
  }), [guests, invitations]);

  function openNew() {
    setFormError(""); setSavedGuestId(null);
    setEditing(null);
    setDraft(blankGuest);
    setInviteDraft(blankInvites);
    setModalOpen(true);
  }

  function openEdit(guest: Guest) {
    setFormError(""); setSavedGuestId(null);
    setEditing(guest);
    setDraft({
      first_name: guest.first_name,
      last_name: guest.last_name,
      group_id: guest.group_id || "",
      phone: guest.phone || "",
      email: guest.email || "",
      relationship_side: guest.relationship_side,
      is_child: guest.is_child,
      dietary_notes: guest.dietary_notes || "",
      notes: guest.notes || "",
    });
    const current = invitationsByGuest.get(guest.id) || [];
    const next: InviteDraft = structuredClone(blankInvites);
    (Object.keys(next) as EventKey[]).forEach((key) => {
      const invitation = current.find((i) => i.event_type === key);
      next[key] = invitation ? { invited: invitation.invited, rsvp: invitation.rsvp } : { invited: false, rsvp: "pending" };
    });
    setInviteDraft(next);
    setModalOpen(true);
  }

  async function saveGuest(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    if (!draft.first_name.trim() || !draft.last_name.trim()) { setFormError("Completá nombre y apellido."); return; }
    const guestIdBefore = editing?.id || savedGuestId;
    const leavingParty = !inviteDraft.party.invited || inviteDraft.party.rsvp === "declined";
    if (guestIdBefore && leavingParty && assignments.some((assignment) => assignment.guest_id === guestIdBefore) && !confirm("Esta persona tiene una mesa asignada. Si ya no asiste a la fiesta, su lugar seguirá reservado hasta que lo quites desde Mesas. ¿Guardar el cambio?")) return;
    setSaving(true);
    let guestWritten = false;
    try {
      const supabase = createClient();
      const payload = { wedding_id: wedding.id, first_name: draft.first_name.trim(), last_name: draft.last_name.trim(), group_id: draft.group_id || null, phone: draft.phone.trim() || null, email: draft.email.trim() || null, relationship_side: draft.relationship_side, is_child: draft.is_child, dietary_notes: draft.dietary_notes.trim() || null, notes: draft.notes.trim() || null };
      const result = guestIdBefore
        ? await supabase.from("guests").update(payload).eq("id", guestIdBefore).eq("wedding_id", wedding.id).select("id").single()
        : await supabase.from("guests").insert(payload).select("id").single();
      if (result.error || !result.data) throw new Error("guest");
      const guestId = result.data.id;
      guestWritten = true;
      setSavedGuestId(guestId);
      const rows = (Object.keys(inviteDraft) as EventKey[]).map((key) => ({ wedding_id: wedding.id, guest_id: guestId, event_type: key, invited: inviteDraft[key].invited, rsvp: inviteDraft[key].invited ? inviteDraft[key].rsvp : "pending" }));
      const invitationsResult = await supabase.from("guest_invitations").upsert(rows, { onConflict: "guest_id,event_type" });
      if (invitationsResult.error) throw new Error("invitations");
      setModalOpen(false); setNotice("Invitado y confirmaciones guardados.");
      setQuery(""); setEventFilter("all"); setRsvpFilter("all"); setGroupFilter("all"); setSideFilter("all");
      await load();
    } catch {
      setFormError(guestWritten ? "Los datos de la persona se guardaron, pero sus invitaciones no pudieron actualizarse. Reintentá guardar para completar el cambio." : "No pudimos guardar el invitado. Tus datos siguen acá; intentá nuevamente.");
      if (guestWritten) await load();
    } finally { setSaving(false); }
  }

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault();
    if (groupSaving) return;
    setGroupError("");
    if (!groupName.trim()) { setGroupError("Escribí un nombre para el grupo."); return; }
    if (groups.some((group) => searchText(group.name) === searchText(groupName))) { setGroupError("Ya existe un grupo con este nombre. Podés seleccionarlo en el formulario del invitado."); return; }
    setGroupSaving(true);
    try {
      const supabase = createClient();
      const result = await supabase.from("guest_groups").insert({ wedding_id: wedding.id, name: groupName.trim(), group_type: groupType }).select("*").single();
      if (result.error || !result.data) throw new Error("group");
      setGroups((current) => [...current, result.data as GuestGroup].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft((current) => ({ ...current, group_id: result.data.id }));
      setGroupName(""); setGroupModalOpen(false);
    } catch { setGroupError("No pudimos crear el grupo. Intentá nuevamente."); }
    finally { setGroupSaving(false); }
  }

  async function removeGuest(guest: Guest) {
    if (saving || !confirm(`¿Eliminar a ${guest.first_name} ${guest.last_name}?`)) return;
    setSaving(true); setFormError("");
    try {
      const supabase = createClient();
      const result = await supabase.from("guests").delete().eq("id", guest.id).eq("wedding_id", wedding.id).select("id").single();
      if (result.error) throw result.error;
      setModalOpen(false); setNotice("Invitado eliminado."); await load();
    } catch { setFormError("No pudimos eliminar el invitado. Intentá nuevamente."); }
    finally { setSaving(false); }
  }

  function invitationFor(guestId: string, type: EventKey) {
    return (invitationsByGuest.get(guestId) || []).find((invitation) => invitation.event_type === type);
  }

  const partyPending = invitations.filter((invitation) => invitation.event_type === "party" && invitation.invited && invitation.rsvp === "pending").length;
  const sideName = (side: string) => side === "agustin" ? wedding.partner_two_name : side === "agustina" ? wedding.partner_one_name : "Ambos";
  function eventBadge(guestId: string, type: EventKey) {
    const invitation = invitationFor(guestId, type);
    return invitation?.invited ? <StatusBadge tone={invitation.rsvp === "confirmed" ? "success" : invitation.rsvp === "declined" ? "danger" : "warning"}>{RSVP_STATUS[invitation.rsvp]}</StatusBadge> : <span className="text-xs text-[var(--muted)]">Sin invitación</span>;
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader eyebrow="Las personas que queremos cerca" title="Invitados" description="Nuestra lista, sus confirmaciones y los detalles para que cada persona se sienta bienvenida." actions={<div className="flex flex-wrap gap-2"><Link href="/mesas" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--cream-2)]"><TableProperties size={17} /> Organizar mesas</Link><Button className="min-h-11" onClick={openNew}><UserRoundPlus size={17} /> Agregar invitado</Button></div>} />
      <Card className="overflow-hidden border-[var(--moss-dark)] bg-[var(--ink)] p-5 text-white sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-[#c7d1b7]">Nuestra celebración, juntos</p><h2 className="mt-2 font-serif text-3xl">Un lugar para cada historia</h2></div><p className="text-sm text-white/75">{loading || error ? "Actualizando…" : `${stats.total} personas · Meta aproximada: ${wedding.guest_target}`}</p></div><div className="mt-4 flex flex-wrap gap-2">{([{ key: "civil", label: "Civil", value: stats.civil }, { key: "church", label: "Iglesia", value: stats.church }, { key: "party", label: "Fiesta", value: stats.party }]).map(({ key, label, value }) => <button key={key} aria-pressed={eventFilter === key} onClick={() => setEventFilter(eventFilter === key ? "all" : key)} style={{ fontSize: "12px" }} className={`min-h-11 rounded-full border px-4 ${eventFilter === key ? "border-[#c7d1b7] bg-[#c7d1b7] text-[var(--ink)]" : "border-white/20 bg-white/5 text-white/80"}`}>{label} · {loading || error ? "—" : value}</button>)}</div></Card>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">{[{ label: "En nuestra lista", value: stats.total, icon: Users }, { label: "Fiesta confirmados", value: stats.confirmedParty, icon: CheckCircle2 }, { label: "Fiesta por responder", value: partyPending, icon: Clock3 }, { label: "Niños en la lista", value: guests.filter((guest) => guest.is_child).length, icon: Baby }].map(({ label, value, icon: Icon }) => <Card key={label} className="min-w-0 p-4"><Icon size={18} className="text-[var(--moss)]" /><p className="mt-2 text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-2xl font-semibold">{loading || error ? "—" : value}</p></Card>)}</div>
      {notice ? <p role="status" className="rounded-xl bg-[var(--moss-soft)] p-3 text-sm text-[var(--moss-dark)]">{notice}</p> : null}
      {error ? <div role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-4 text-sm text-[var(--burgundy)]">{error}<Button className="mt-2" disabled={loading} variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : null}
      <Card className="min-w-0 p-4"><div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="relative min-w-0 sm:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} /><Input aria-label="Buscar invitado" className="min-w-0 w-full pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o grupo…" /></div>
        <Select aria-label="Filtrar por evento" className="min-w-0 w-full" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="all">Todos los eventos</option><option value="civil">Civil</option><option value="church">Iglesia</option><option value="party">Fiesta</option></Select>
        <Select aria-label="Filtrar por confirmación" className="min-w-0 w-full" value={rsvpFilter} onChange={(event) => setRsvpFilter(event.target.value)}><option value="all">Todas las respuestas</option><option value="pending">Por responder</option><option value="confirmed">Confirmados</option><option value="declined">No asisten</option></Select>
        <Select aria-label="Filtrar por grupo" className="min-w-0 w-full" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">Todas las familias y grupos</option><option value="none">Sin grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>
        <Select aria-label="Filtrar por vínculo" className="min-w-0 w-full" value={sideFilter} onChange={(event) => setSideFilter(event.target.value)}><option value="all">Todos los vínculos</option><option value="both">Ambos</option><option value="agustina">{wedding.partner_one_name}</option><option value="agustin">{wedding.partner_two_name}</option></Select>
      </div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--muted)]">{loading ? "Cargando…" : `${visible.length} personas en esta vista`}{eventFilter === "all" && rsvpFilter !== "all" ? " · Respuesta en cualquiera de los eventos" : ""}</p>{query || eventFilter !== "all" || rsvpFilter !== "all" || groupFilter !== "all" || sideFilter !== "all" ? <button className="min-h-11 text-sm font-semibold text-[var(--moss)]" onClick={() => { setQuery(""); setEventFilter("all"); setRsvpFilter("all"); setGroupFilter("all"); setSideFilter("all"); }}>Limpiar filtros</button> : null}</div></Card>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]"><Loader2 size={18} className="animate-spin" /> Actualizando nuestra lista…</div> : error ? null : visible.length ? <>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">{visible.map((guest) => <Card key={guest.id} className="min-w-0 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-serif text-xl">{guest.first_name} {guest.last_name}</h2><p className="mt-1 break-words text-xs text-[var(--muted)]">{groupById.get(guest.group_id || "")?.name || "Sin grupo"} · {sideName(guest.relationship_side)}</p></div><Button className="min-h-11 shrink-0" variant="ghost" size="sm" onClick={() => openEdit(guest)} aria-label={`Editar ${guest.first_name} ${guest.last_name}`}><Pencil size={16} /></Button></div>
          <div className="mt-3 grid grid-cols-1 gap-2">{(["civil", "church", "party"] as EventKey[]).map((type) => <div key={type} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--cream)] px-3 py-2"><span className="text-xs font-medium">{EVENT_LABELS[type]}</span>{eventBadge(guest.id, type)}</div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2">{guest.is_child ? <StatusBadge tone="moss">Niño / menor</StatusBadge> : null}{guest.dietary_notes ? <StatusBadge tone="burgundy">Atención a la alimentación</StatusBadge> : null}</div>
          {guest.dietary_notes ? <p className="mt-2 break-words text-xs leading-5 text-[var(--burgundy)]">{guest.dietary_notes}</p> : null}<p className="mt-2 break-words text-xs text-[var(--muted)]">{guest.phone || guest.email || "Contacto sin cargar"}</p>
        </Card>)}</div>
        <Card className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left text-sm"><thead className="bg-[var(--cream-2)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]"><tr><th className="px-4 py-3">Invitado</th><th className="px-4 py-3">Familia / grupo</th><th className="px-4 py-3">Civil</th><th className="px-4 py-3">Iglesia</th><th className="px-4 py-3">Fiesta</th><th className="px-4 py-3">Vínculo</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{visible.map((guest) => <tr key={guest.id} className="hover:bg-[var(--cream)]/60"><td className="max-w-64 px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{guest.first_name} {guest.last_name}</span>{guest.is_child ? <Baby size={15} aria-label="Niño / menor" className="text-[var(--moss)]" /> : null}</div><p className="mt-1 break-words text-xs text-[var(--muted)]">{guest.phone || guest.email || "Contacto sin cargar"}</p>{guest.dietary_notes ? <p className="mt-1 break-words text-xs text-[var(--burgundy)]">{guest.dietary_notes}</p> : null}</td><td className="max-w-48 break-words px-4 py-3 text-xs text-[var(--muted)]">{groupById.get(guest.group_id || "")?.name || "Sin grupo"}</td>{(["civil", "church", "party"] as EventKey[]).map((type) => <td key={type} className="px-4 py-3">{eventBadge(guest.id, type)}</td>)}<td className="px-4 py-3 text-xs text-[var(--muted)]">{sideName(guest.relationship_side)}</td><td className="px-4 py-3"><Button className="min-h-11" variant="ghost" size="sm" onClick={() => openEdit(guest)} aria-label={`Editar ${guest.first_name} ${guest.last_name}`}><Pencil size={15} /></Button></td></tr>)}</tbody></table></div></Card>
      </> : <EmptyState icon={Users} title={guests.length ? "No hay invitados con estos filtros" : "Nuestra lista empieza acá"} description={guests.length ? "Probá otra respuesta, evento o grupo." : "Agregá a las personas con las que queremos compartir el gran día."} action={<Button onClick={openNew}><Plus size={16} /> Agregar invitado</Button>} />}

      <Modal open={modalOpen && !groupModalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editing ? "Editar invitado" : "Nuevo invitado"} description="La asistencia se maneja de manera independiente para civil, iglesia y fiesta." size="lg">
        <form onSubmit={saveGuest} className="grid min-w-0 gap-5">
          {formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}
          <fieldset disabled={saving} className="grid min-w-0 gap-5">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><Input required value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></Field><Field label="Apellido"><Input required value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label="Familia / grupo"><Select className="min-w-0 w-full" value={draft.group_id} onChange={(e) => setDraft({ ...draft, group_id: e.target.value })}><option value="">Sin grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field><Button type="button" variant="secondary" onClick={() => { setGroupError(""); setGroupModalOpen(true); }}><Plus size={16} /> Nuevo grupo</Button></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Teléfono"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field><Field label="Email"><Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Vínculo principal"><Select value={draft.relationship_side} onChange={(e) => setDraft({ ...draft, relationship_side: e.target.value })}><option value="both">Ambos</option><option value="agustin">Agustín</option><option value="agustina">Agustina</option></Select></Field><label className="flex h-10 items-center gap-2 self-end rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><input type="checkbox" checked={draft.is_child} onChange={(e) => setDraft({ ...draft, is_child: e.target.checked })} /> Es menor / niño</label></div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Invitación y confirmación</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["civil", "church", "party"] as EventKey[]).map((type) => (
                <div key={type} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                  <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={inviteDraft[type].invited} onChange={(e) => setInviteDraft({ ...inviteDraft, [type]: { ...inviteDraft[type], invited: e.target.checked } })} /> {EVENT_LABELS[type]}</label>
                  <div className="mt-3"><Select aria-label={`Confirmación ${EVENT_LABELS[type]}`} disabled={!inviteDraft[type].invited} className="w-full" value={inviteDraft[type].rsvp} onChange={(e) => setInviteDraft({ ...inviteDraft, [type]: { ...inviteDraft[type], rsvp: e.target.value as InviteDraft[EventKey]["rsvp"] } })}><option value="pending">Pendiente</option><option value="confirmed">Confirmado</option><option value="declined">No asiste</option></Select></div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2"><Field label="Alimentación / alergias"><Textarea value={draft.dietary_notes} onChange={(e) => setDraft({ ...draft, dietary_notes: e.target.value })} placeholder="Vegetariano, celiaquía, alergias..." /></Field><Field label="Notas"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field></div>
          <div className="flex flex-wrap justify-between gap-2"><div>{editing ? <Button type="button" variant="danger" onClick={() => void removeGuest(editing)}><Trash2 size={15} />Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} Guardar invitado</Button></div></div>
          </fieldset>
        </form>
      </Modal>

      <Modal open={groupModalOpen} onClose={() => { if (!groupSaving) setGroupModalOpen(false); }} title="Nueva familia o grupo" size="sm">
        <form onSubmit={saveGroup} className="grid gap-4">{groupError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{groupError}</p> : null}<fieldset disabled={groupSaving} className="grid min-w-0 gap-4"><Field label="Nombre"><Input required value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ej. Familia Pérez" /></Field><Field label="Tipo"><Select value={groupType} onChange={(e) => setGroupType(e.target.value)}><option value="family">Familia</option><option value="couple">Pareja</option><option value="friends">Amigos</option><option value="other">Otro</option></Select></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setGroupModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={groupSaving}>{groupSaving ? <Loader2 size={15} className="animate-spin" /> : null}Crear grupo</Button></div></fieldset></form>
      </Modal>
    </div>
  );
}
