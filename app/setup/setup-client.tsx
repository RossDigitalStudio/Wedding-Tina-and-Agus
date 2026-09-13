"use client";

import { Heart, KeyRound, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export function SetupClient() {
  const router = useRouter();
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function bootstrap() {
    setLoading("create");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("bootstrap_aa_wedding");
    if (error) {
      setError(error.message.includes("already exists") ? "La boda ya fue inicializada. Entrá con el código compartido." : error.message);
      setLoading(null);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("join");
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.rpc("join_wedding_by_code", { p_code: String(form.get("code") || "").trim() });
    if (error) {
      setError("Código incorrecto o boda no disponible.");
      setLoading(null);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[var(--cream)] p-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--moss)] text-white"><Heart size={20} fill="currentColor" /></div>
          <h1 className="mt-4 font-serif text-4xl">Configurar A&A Wedding Planner</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Esto se hace una sola vez. La primera cuenta crea la boda y la segunda se suma con el código.</p>
        </div>
        {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--moss-soft)] text-[var(--moss)]"><Sparkles size={20} /></div>
            <h2 className="mt-5 font-serif text-2xl">Primera cuenta</h2>
            <p className="mt-2 min-h-20 text-sm leading-6 text-[var(--muted)]">Crea la boda de Agustina & Agustín, carga las fechas, lugares, pendientes iniciales, documentación y cuotas mensuales del salón.</p>
            <Button className="mt-5 w-full" onClick={bootstrap} disabled={loading !== null}>
              {loading === "create" ? <Loader2 size={17} className="animate-spin" /> : null}
              Inicializar nuestra boda
            </Button>
          </Card>
          <Card className="p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--burgundy-soft)] text-[var(--burgundy)]"><KeyRound size={20} /></div>
            <h2 className="mt-5 font-serif text-2xl">Segunda cuenta</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ingresá el código que figura en Configuración de la primera cuenta. El código inicial es <strong>A&A-231027</strong>.</p>
            <form onSubmit={join} className="mt-4 grid gap-3">
              <Field label="Código compartido"><Input name="code" required placeholder="A&A-231027" /></Field>
              <Button type="submit" variant="secondary" disabled={loading !== null}>
                {loading === "join" ? <Loader2 size={17} className="animate-spin" /> : null}
                Unirme
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
