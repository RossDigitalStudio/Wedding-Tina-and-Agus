"use client";

import { CalendarSync, Check, Copy, Loader2, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { wedding } = useWedding();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState({
    partner_one_name: wedding.partner_one_name,
    partner_two_name: wedding.partner_two_name,
    civil_date: wedding.civil_date,
    ceremony_date: wedding.ceremony_date,
    civil_location: wedding.civil_location || "",
    ceremony_name: wedding.ceremony_name || "",
    ceremony_address: wedding.ceremony_address || "",
    reception_name: wedding.reception_name || "",
    reception_address: wedding.reception_address || "",
    guest_target: String(wedding.guest_target),
    budget_target: wedding.budget_target?.toString() || "",
    invite_code: wedding.invite_code,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.from("weddings").update({
      partner_one_name: draft.partner_one_name.trim(),
      partner_two_name: draft.partner_two_name.trim(),
      civil_date: draft.civil_date,
      ceremony_date: draft.ceremony_date,
      civil_location: draft.civil_location.trim() || null,
      ceremony_name: draft.ceremony_name.trim() || null,
      ceremony_address: draft.ceremony_address.trim() || null,
      reception_name: draft.reception_name.trim() || null,
      reception_address: draft.reception_address.trim() || null,
      guest_target: Number(draft.guest_target) || 100,
      budget_target: draft.budget_target ? Number(draft.budget_target) : null,
      invite_code: draft.invite_code.trim(),
    }).eq("id", wedding.id);
    if (error) alert(error.message); else { setSaved(true); router.refresh(); }
    setSaving(false);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(draft.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Datos generales" title="Configuración" description="Fechas, lugares, objetivo de invitados, presupuesto y acceso compartido." />

      <form onSubmit={save} className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
        <Card className="p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Nuestro casamiento</h2>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre 1"><Input value={draft.partner_one_name} onChange={(e) => setDraft({ ...draft, partner_one_name: e.target.value })} /></Field><Field label="Nombre 2"><Input value={draft.partner_two_name} onChange={(e) => setDraft({ ...draft, partner_two_name: e.target.value })} /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha del civil"><Input type="date" value={draft.civil_date} onChange={(e) => setDraft({ ...draft, civil_date: e.target.value })} /></Field><Field label="Fecha iglesia + fiesta"><Input type="date" value={draft.ceremony_date} onChange={(e) => setDraft({ ...draft, ceremony_date: e.target.value })} /></Field></div>
            <Field label="Lugar del civil"><Input value={draft.civil_location} onChange={(e) => setDraft({ ...draft, civil_location: e.target.value })} placeholder="Completar cuando definan el Registro Civil" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Iglesia"><Input value={draft.ceremony_name} onChange={(e) => setDraft({ ...draft, ceremony_name: e.target.value })} /></Field><Field label="Dirección iglesia"><Input value={draft.ceremony_address} onChange={(e) => setDraft({ ...draft, ceremony_address: e.target.value })} /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Salón"><Input value={draft.reception_name} onChange={(e) => setDraft({ ...draft, reception_name: e.target.value })} /></Field><Field label="Dirección salón"><Input value={draft.reception_address} onChange={(e) => setDraft({ ...draft, reception_address: e.target.value })} /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Objetivo de invitados"><Input type="number" min="1" value={draft.guest_target} onChange={(e) => setDraft({ ...draft, guest_target: e.target.value })} /></Field><Field label="Presupuesto objetivo (ARS)"><Input type="number" min="0" value={draft.budget_target} onChange={(e) => setDraft({ ...draft, budget_target: e.target.value })} placeholder="Opcional" /></Field></div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-[var(--moss-soft)] p-2.5 text-[var(--moss)]"><ShieldCheck size={19} /></div><div><h2 className="font-serif text-2xl">Acceso de pareja</h2><p className="mt-1 text-sm leading-5 text-[var(--muted)]">La segunda cuenta usa este código una sola vez para asociarse a la misma boda.</p></div></div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><Input value={draft.invite_code} onChange={(e) => setDraft({ ...draft, invite_code: e.target.value })} /><Button type="button" variant="secondary" onClick={copyCode}>{copied ? <Check size={16} /> : <Copy size={16} />}</Button></div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-[var(--burgundy-soft)] p-2.5 text-[var(--burgundy)]"><CalendarSync size={19} /></div><div><h2 className="font-serif text-2xl">Google Calendar</h2><p className="mt-1 text-sm leading-5 text-[var(--muted)]">Preparado para una segunda etapa. Los eventos ya tienen campos <code>google_event_id</code> y estado de sincronización para conectar OAuth sin migrar datos.</p></div></div>
            <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--cream)] p-3 text-xs leading-5 text-[var(--muted)]">En esta V1 no se almacenan tokens de Google ni se pide acceso a sus calendarios. En el README queda documentado dónde incorporar OAuth cuando quieran activarlo.</div>
          </Card>

          <Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? <Loader2 size={17} className="animate-spin" /> : saved ? <Check size={17} /> : <Save size={17} />} {saved ? "Guardado" : "Guardar cambios"}</Button>
        </div>
      </form>
    </div>
  );
}
