"use client";

import { CalendarDays, Check, Copy, Heart, Loader2, MapPin, Save, ShieldCheck, Target } from "lucide-react";
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
  const initial = {
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
    budget_target: wedding.budget_target?.toString() ?? "",
    invite_code: wedding.invite_code,
  };
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  function change(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaved(false);
    const guests = Number(draft.guest_target),
      budget = Number(draft.budget_target);
    if (
      !draft.partner_one_name.trim() ||
      !draft.partner_two_name.trim() ||
      !draft.invite_code.trim() ||
      !draft.civil_date ||
      !draft.ceremony_date
    ) {
      setError("Completá los nombres, las fechas y el código de acceso.");
      return;
    }
    if (!draft.guest_target.trim() || !Number.isInteger(guests) || guests < 1) {
      setError("El objetivo de invitados debe ser un número entero mayor que cero.");
      return;
    }
    if (draft.budget_target && (!Number.isFinite(budget) || budget < 0)) {
      setError("El presupuesto debe ser un número mayor o igual a cero, o quedar vacío.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await createClient()
        .from("weddings")
        .update({
          partner_one_name: draft.partner_one_name.trim(),
          partner_two_name: draft.partner_two_name.trim(),
          civil_date: draft.civil_date,
          ceremony_date: draft.ceremony_date,
          civil_location: draft.civil_location.trim() || null,
          ceremony_name: draft.ceremony_name.trim() || null,
          ceremony_address: draft.ceremony_address.trim() || null,
          reception_name: draft.reception_name.trim() || null,
          reception_address: draft.reception_address.trim() || null,
          guest_target: guests,
          budget_target: draft.budget_target ? budget : null,
          invite_code: draft.invite_code.trim(),
        })
        .eq("id", wedding.id)
        .select("id")
        .single();
      if (error) throw error;
      const normalized = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, value.trim()]),
      ) as typeof draft;
      setDraft(normalized);
      setBaseline(normalized);
      setSaved(true);
      router.refresh();
    } catch {
      setError("No pudimos guardar los cambios. Revisá la conexión y reintentá; lo que completaste sigue acá.");
    } finally {
      setSaving(false);
    }
  }
  async function copyCode() {
    setError("");
    try {
      await navigator.clipboard.writeText(baseline.invite_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("No pudimos copiar el código. Podés seleccionarlo y copiarlo manualmente.");
    }
  }
  const sectionTitle = (Icon: typeof Heart, title: string, description: string) => (
    <div className="mb-5 flex items-start gap-3">
      <div className="shrink-0 rounded-xl bg-[var(--moss-soft)] p-2.5 text-[var(--moss)]">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Los detalles de nuestra celebración"
        title="Configuración"
        description="Nuestros nombres, fechas y lugares. Todo lo que le da forma al casamiento."
      />
      <form onSubmit={save} className="space-y-5">
        <fieldset
          disabled={saving}
          className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)] [&_input]:w-full [&_input]:min-w-0 [&_label]:min-w-0"
        >
          <div className="min-w-0 space-y-5">
            <Card className="min-w-0 p-5 sm:p-6">
              {sectionTitle(Heart, "Nosotros", "Así aparecen nuestros nombres en el organizador.")}
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["partner_one_name", "Primer nombre"],
                    ["partner_two_name", "Segundo nombre"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input required value={draft[key]} onChange={(e) => change(key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </Card>
            <Card className="min-w-0 p-5 sm:p-6">
              {sectionTitle(CalendarDays, "Nuestras fechas", "El civil y el día de la iglesia y la fiesta.")}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha del civil">
                  <Input
                    required
                    type="date"
                    value={draft.civil_date}
                    onChange={(e) => change("civil_date", e.target.value)}
                  />
                </Field>
                <Field label="Fecha de iglesia y fiesta">
                  <Input
                    required
                    type="date"
                    value={draft.ceremony_date}
                    onChange={(e) => change("ceremony_date", e.target.value)}
                  />
                </Field>
              </div>
            </Card>
            <Card className="min-w-0 p-5 sm:p-6">
              {sectionTitle(
                MapPin,
                "Dónde celebramos",
                "Podés completar los lugares y las direcciones cuando estén definidos.",
              )}
              <div className="space-y-5">
                <Field label="Lugar del civil">
                  <Input
                    value={draft.civil_location}
                    onChange={(e) => change("civil_location", e.target.value)}
                    placeholder="Registro Civil"
                  />
                </Field>
                <div className="grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
                  <Field label="Iglesia">
                    <Input value={draft.ceremony_name} onChange={(e) => change("ceremony_name", e.target.value)} />
                  </Field>
                  <Field label="Dirección de la iglesia">
                    <Input
                      value={draft.ceremony_address}
                      onChange={(e) => change("ceremony_address", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
                  <Field label="Salón">
                    <Input value={draft.reception_name} onChange={(e) => change("reception_name", e.target.value)} />
                  </Field>
                  <Field label="Dirección del salón">
                    <Input
                      value={draft.reception_address}
                      onChange={(e) => change("reception_address", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </Card>
          </div>
          <div className="min-w-0 space-y-5">
            <Card className="min-w-0 p-5 sm:p-6">
              {sectionTitle(Target, "Nuestros objetivos", "Una referencia para organizar invitados y gastos.")}
              <div className="grid gap-4">
                <Field label="Objetivo de invitados">
                  <Input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={draft.guest_target}
                    onChange={(e) => change("guest_target", e.target.value)}
                  />
                </Field>
                <Field
                  label={`Presupuesto objetivo (${wedding.currency || "ARS"})`}
                  hint="Opcional. Dejalo vacío si todavía no lo definieron."
                >
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.budget_target}
                    onChange={(e) => change("budget_target", e.target.value)}
                    placeholder="Sin definir"
                  />
                </Field>
              </div>
            </Card>
            <Card className="min-w-0 p-5 sm:p-6">
              {sectionTitle(
                ShieldCheck,
                "Acceso de pareja",
                "La segunda cuenta usa este código para sumarse al mismo casamiento.",
              )}
              <Field label="Código de acceso">
                <Input required value={draft.invite_code} onChange={(e) => change("invite_code", e.target.value)} />
              </Field>
              <div className="mt-4 rounded-xl bg-[var(--cream)] p-3">
                <p className="text-xs text-[var(--muted)]">Código guardado para compartir</p>
                <p className="mt-1 break-all font-mono text-sm">{baseline.invite_code}</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  aria-label="Copiar código guardado"
                  onClick={copyCode}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copiado" : "Copiar código"}
                </Button>
              </div>
              {draft.invite_code !== baseline.invite_code ? (
                <p className="mt-3 text-xs text-[var(--burgundy)]">Guardá el nuevo código antes de compartirlo.</p>
              ) : null}
            </Card>
          </div>
        </fieldset>
        <div className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
          {error ? (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-[var(--muted)]">
              {saving
                ? "Guardando…"
                : saved
                  ? "Los cambios quedaron guardados."
                  : dirty
                    ? "Tenés cambios sin guardar."
                    : "Todos los datos están al día."}
            </p>
            <Button type="submit" size="lg" disabled={saving || !dirty}>
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Guardar cambios
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
