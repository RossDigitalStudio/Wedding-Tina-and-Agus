import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-8 text-center">
      <div className="mb-4 rounded-2xl bg-[var(--moss-soft)] p-3 text-[var(--moss)]"><Icon size={22} /></div>
      <h3 className="font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[var(--muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
