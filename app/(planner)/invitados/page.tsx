"use client";

import { Baby, Loader2, Pencil, Plus, Search, Trash2, UserRoundPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import type { Guest, GuestGroup, GuestInvitation } from "@/lib/types";

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

  async function load() {
    const supabase = createClient();
    const [guestRes, groupRes, invitationRes] = await Promise.all([
      supabase.from("guests").select("*").eq("wedding_id", wedding.id).order("last_name").order("first_name"),
      supabase.from("guest_groups").select("*").eq("wedding_id", wedding.id).order("name"),
      supabase.from("guest_invitations").select("*").eq("wedding_id", wedding.id),
    ]);
    setGuests((guestRes.data || []) as Guest[]);
    setGroups((groupRes.data || []) as GuestGroup[]);
    setInvitations((invitationRes.data || []) as GuestInvitation[]);
  }

  useEffect(() => { load(); }, [wedding.id]);

  const invitationsByGuest = useMemo(() => {
    const map = new Map<string, GuestInvitation[]>();
    invitations.forEach((invitation) => map.set(invitation.guest_id, [...(map.get(invitation.guest_id) || []), invitation]));
    return map;
  }, [invitations]);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const visible = useMemo(() => guests.filter((guest) => {
    const text = `${guest.first_name} ${guest.last_name} ${groupById.get(guest.group_id || "")?.name || ""}`.toLowerCase();
    if (!text.includes(query.toLowerCase())) return false;
    const inv = invitationsByGuest.get(guest.id) || [];
    if (eventFilter !== "all" && !inv.some((i) => i.event_type === eventFilter && i.invited)) return false;
    if (rsvpFilter !== "all" && !inv.some((i) => i.invited && i.rsvp === rsvpFilter)) return false;
    return true;
  }), [guests, groupById, invitationsByGuest, query, eventFilter, rsvpFilter]);

  const stats = useMemo(() => ({
    total: guests.length,
    civil: invitations.filter((i) => i.event_type === "civil" && i.invited).length,
    church: invitations.filter((i) => i.event_type === "church" && i.invited).length,
    party: invitations.filter((i) => i.event_type === "party" && i.invited).length,
    confirmedParty: invitations.filter((i) => i.event_type === "party" && i.invited && i.rsvp === "confirmed").length,
  }), [guests, invitations]);

  function openNew() {
    setEditing(null);
    setDraft(blankGuest);
    setInviteDraft(blankInvites);
    setModalOpen(true);
  }

  function openEdit(guest: Guest) {
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
    setSaving(true);
    const supabase = createClient();
    const payload = {
      wedding_id: wedding.id,
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      group_id: draft.group_id || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      relationship_side: draft.relationship_side,
      is_child: draft.is_child,
      dietary_notes: draft.dietary_notes.trim() || null,
      notes: draft.notes.trim() || null,
    };

    let guestId = editing?.id;
    if (editing) {
      await supabase.from("guests").update(payload).eq("id", editing.id);
    } else {
      const { data, error } = await supabase.from("guests").insert(payload).select("id").single();
      if (error || !data) { alert(error?.message || "No se pudo guardar el invitado"); setSaving(false); return; }
      guestId = data.id;
    }

    if (guestId) {
      const rows = (Object.keys(inviteDraft) as EventKey[]).map((key) => ({
        wedding_id: wedding.id,
        guest_id: guestId,
        event_type: key,
        invited: inviteDraft[key].invited,
        rsvp: inviteDraft[key].invited ? inviteDraft[key].rsvp : "pending",
      }));
      await supabase.from("guest_invitations").upsert(rows, { onConflict: "guest_id,event_type" });
    }
    setSaving(false);
    setModalOpen(false);
    await load();
  }

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    const { data, error } = await supabase.from("guest_groups").insert({ wedding_id: wedding.id, name: groupName.trim(), group_type: groupType }).select("*").single();
    if (error || !data) { alert(error?.message || "No se pudo crear el grupo"); return; }
    setGroups((current) => [...current, data as GuestGroup].sort((a, b) => a.name.localeCompare(b.name)));
    setDraft((current) => ({ ...current, group_id: data.id }));
    setGroupName("");
    setGroupModalOpen(false);
  }

  async function removeGuest(guest: Guest) {
    if (!confirm(`¿Eliminar a ${guest.first_name} ${guest.last_name}?`)) return;
    const supabase = createClient();
    await supabase.from("guests").delete().eq("id", guest.id);
    await load();
  }

  function invitationFor(guestId: string, type: EventKey) {
    return (invitationsByGuest.get(guestId) || []).find((i) => i.event_type === type);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Lista estimada · 100 personas" title="Invitados" description="Agrupá por familia o pareja, definí a qué evento está invitada cada persona y registrá la confirmación por separado." actions={<Button onClick={openNew}><UserRoundPlus size={17} /> Agregar invitado</Button>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">Cargados</div><div className="mt-1 text-2xl font-semibold">{stats.total}<span className="text-sm font-normal text-[var(--muted)]">/{wedding.guest_target}</span></div></Card>
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">Civil</div><div className="mt-1 text-2xl font-semibold">{stats.civil}</div></Card>
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">Iglesia</div><div className="mt-1 text-2xl font-semibold">{stats.church}</div></Card>
        <Card className="p-4"><div className="text-xs text-[var(--muted)]">Fiesta</div><div className="mt-1 text-2xl font-semibold">{stats.party}</div></Card>
        <Card className="col-span-2 p-4 sm:col-span-1"><div className="text-xs text-[var(--muted)]">Fiesta confirmados</div><div className="mt-1 text-2xl font-semibold text-[var(--moss)]">{stats.confirmedParty}</div></Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} /><Input className="w-full pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o grupo..." /></div>
          <Select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}><option value="all">Todos los eventos</option><option value="civil">Civil</option><option value="church">Iglesia</option><option value="party">Fiesta</option></Select>
          <Select value={rsvpFilter} onChange={(e) => setRsvpFilter(e.target.value)}><option value="all">Cualquier RSVP</option><option value="pending">Pendiente</option><option value="confirmed">Confirmado</option><option value="declined">No asiste</option></Select>
        </div>
      </Card>

      {visible.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[var(--cream-2)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr><th className="px-4 py-3">Invitado</th><th className="px-4 py-3">Grupo</th><th className="px-4 py-3 text-center">Civil</th><th className="px-4 py-3 text-center">Iglesia</th><th className="px-4 py-3 text-center">Fiesta</th><th className="px-4 py-3">Lado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {visible.map((guest) => (
                  <tr key={guest.id} className="hover:bg-[var(--cream)]/60">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div><div className="font-medium">{guest.first_name} {guest.last_name}</div><div className="mt-0.5 text-xs text-[var(--muted)]">{guest.phone || guest.email || "Sin contacto"}</div></div>{guest.is_child ? <Baby size={15} className="text-[var(--burgundy)]" /> : null}</div></td>
                    <td className="px-4 py-3 text-[var(--muted)]">{groupById.get(guest.group_id || "")?.name || "—"}</td>
                    {(["civil", "church", "party"] as EventKey[]).map((type) => {
                      const inv = invitationFor(guest.id, type);
                      return <td key={type} className="px-4 py-3 text-center">{inv?.invited ? <StatusBadge tone={inv.rsvp === "confirmed" ? "success" : inv.rsvp === "declined" ? "danger" : "warning"}>{RSVP_STATUS[inv.rsvp]}</StatusBadge> : <span className="text-xs text-neutral-400">No invitado</span>}</td>;
                    })}
                    <td className="px-4 py-3 text-[var(--muted)]">{guest.relationship_side === "agustin" ? "Agustín" : guest.relationship_side === "agustina" ? "Agustina" : "Ambos"}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(guest)}><Pencil size={15} /></Button><Button variant="ghost" size="sm" onClick={() => removeGuest(guest)}><Trash2 size={15} /></Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : <EmptyState icon={Users} title="Todavía no hay invitados" description="Empezá por familiares, amigos y parejas. La meta está configurada en aproximadamente 100 personas." action={<Button onClick={openNew}><Plus size={16} /> Primer invitado</Button>} />}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar invitado" : "Nuevo invitado"} description="La asistencia se maneja de manera independiente para civil, iglesia y fiesta." size="lg">
        <form onSubmit={saveGuest} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><Input required value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></Field><Field label="Apellido"><Input required value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="Familia / grupo"><Select value={draft.group_id} onChange={(e) => setDraft({ ...draft, group_id: e.target.value })}><option value="">Sin grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field><Button type="button" variant="secondary" onClick={() => setGroupModalOpen(true)}><Plus size={16} /> Nuevo grupo</Button></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Teléfono"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field><Field label="Email"><Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Vínculo principal"><Select value={draft.relationship_side} onChange={(e) => setDraft({ ...draft, relationship_side: e.target.value })}><option value="both">Ambos</option><option value="agustin">Agustín</option><option value="agustina">Agustina</option></Select></Field><label className="flex h-10 items-center gap-2 self-end rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><input type="checkbox" checked={draft.is_child} onChange={(e) => setDraft({ ...draft, is_child: e.target.checked })} /> Es menor / niño</label></div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Invitación y confirmación</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["civil", "church", "party"] as EventKey[]).map((type) => (
                <div key={type} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                  <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={inviteDraft[type].invited} onChange={(e) => setInviteDraft({ ...inviteDraft, [type]: { ...inviteDraft[type], invited: e.target.checked } })} /> {EVENT_LABELS[type]}</label>
                  <div className="mt-3"><Select disabled={!inviteDraft[type].invited} className="w-full" value={inviteDraft[type].rsvp} onChange={(e) => setInviteDraft({ ...inviteDraft, [type]: { ...inviteDraft[type], rsvp: e.target.value as InviteDraft[EventKey]["rsvp"] } })}><option value="pending">Pendiente</option><option value="confirmed">Confirmado</option><option value="declined">No asiste</option></Select></div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2"><Field label="Alimentación / alergias"><Textarea value={draft.dietary_notes} onChange={(e) => setDraft({ ...draft, dietary_notes: e.target.value })} placeholder="Vegetariano, celiaquía, alergias..." /></Field><Field label="Notas"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} Guardar invitado</Button></div>
        </form>
      </Modal>

      <Modal open={groupModalOpen} onClose={() => setGroupModalOpen(false)} title="Nueva familia o grupo" size="sm">
        <form onSubmit={saveGroup} className="grid gap-4"><Field label="Nombre"><Input required value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ej. Familia Pérez" /></Field><Field label="Tipo"><Select value={groupType} onChange={(e) => setGroupType(e.target.value)}><option value="family">Familia</option><option value="couple">Pareja</option><option value="friends">Amigos</option><option value="other">Otro</option></Select></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setGroupModalOpen(false)}>Cancelar</Button><Button type="submit">Crear grupo</Button></div></form>
      </Modal>
    </div>
  );
}
