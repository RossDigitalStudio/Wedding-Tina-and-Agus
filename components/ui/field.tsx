import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-[var(--ink)]">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-normal text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("min-h-24 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]", props.className)} />;
}
