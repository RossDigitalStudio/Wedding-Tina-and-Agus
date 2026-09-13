import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
          <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</div>
          {detail ? <div className="mt-1 text-xs text-[var(--muted)]">{detail}</div> : null}
        </div>
        <div className="rounded-xl bg-[var(--moss-soft)] p-2.5 text-[var(--moss)]"><Icon size={19} /></div>
      </div>
    </Card>
  );
}
