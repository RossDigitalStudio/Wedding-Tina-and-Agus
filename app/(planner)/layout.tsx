import { redirect } from "next/navigation";
import { AppShell } from "@/components/planner/app-shell";
import { createClient } from "@/lib/supabase/server";
import type { Wedding } from "@/lib/types";

export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("wedding_members").select("wedding_id").eq("user_id", user.id).maybeSingle();
  if (!membership?.wedding_id) redirect("/setup");

  const { data: wedding } = await supabase.from("weddings").select("*").eq("id", membership.wedding_id).single();
  if (!wedding) redirect("/setup");

  return <AppShell wedding={wedding as Wedding} userEmail={user.email || ""}>{children}</AppShell>;
}
