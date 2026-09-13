"use client";

import { Heart, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    if (error) {
      setError("No pudimos iniciar sesión. Revisá el email y la contraseña.");
      setLoading(false);
      return;
    }
    router.replace("/setup");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--ink)] p-5">
      <section className="w-full max-w-md overflow-hidden rounded-3xl bg-[var(--cream)] shadow-2xl">
        <div className="border-b border-[var(--line)] p-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--moss)] text-white"><Heart size={21} fill="currentColor" /></div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-[var(--moss)]">Wedding Planner</p>
          <h1 className="mt-2 font-serif text-4xl">Agustina & Agustín</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Nuestro lugar privado para organizar todo.</p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 p-7">
          <Field label="Email"><Input name="email" type="email" autoComplete="email" required placeholder="ustedes@email.com" /></Field>
          <Field label="Contraseña"><Input name="password" type="password" autoComplete="current-password" required /></Field>
          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            Entrar
          </Button>
          <p className="text-center text-xs leading-5 text-[var(--muted)]">El alta de usuarios se hace desde Supabase. La aplicación no tiene registro público.</p>
        </form>
      </section>
    </main>
  );
}
