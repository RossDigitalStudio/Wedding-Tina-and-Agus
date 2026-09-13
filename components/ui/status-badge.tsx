import { cn } from "@/lib/utils";

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "moss" | "burgundy" | "warning" | "success" | "danger" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-700",
    moss: "bg-[var(--moss-soft)] text-[var(--moss-dark)]",
    burgundy: "bg-[var(--burgundy-soft)] text-[var(--burgundy)]",
    warning: "bg-amber-100 text-amber-800",
    success: "bg-emerald-100 text-emerald-800",
    danger: "bg-red-100 text-red-700",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}
