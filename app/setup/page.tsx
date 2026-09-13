import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupClient } from "./setup-client";

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("wedding_members").select("wedding_id").eq("user_id", user.id).maybeSingle();
  if (membership?.wedding_id) redirect("/");

  return <SetupClient />;
}
