import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-[var(--line)] bg-white shadow-[0_10px_35px_rgba(30,30,24,0.05)]", className)} {...props} />;
}
