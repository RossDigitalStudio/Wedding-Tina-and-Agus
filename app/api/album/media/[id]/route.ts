import { NextRequest, NextResponse } from "next/server";
import { createR2PresignedUrl } from "@/lib/r2/signing";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const variant = request.nextUrl.searchParams.get("variant") === "original" ? "original" : "preview";
  const supabase = await createClient();

  const { data: media } = await supabase
    .from("album_media")
    .select("id, original_key, preview_key")
    .eq("id", id)
    .maybeSingle();

  if (!media) return new NextResponse("Not found", { status: 404 });

  const key = variant === "original" ? media.original_key : media.preview_key;
  const signedUrl = createR2PresignedUrl("GET", key, 90);
  return NextResponse.redirect(signedUrl, 307);
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { data: media } = await supabase
    .from("album_media")
    .select("id, wedding_id, original_key, preview_key")
    .eq("id", id)
    .maybeSingle();

  if (!media) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });

  const { data: membership } = await supabase
    .from("wedding_members")
    .select("wedding_id")
    .eq("user_id", user.id)
    .eq("wedding_id", media.wedding_id)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  await Promise.allSettled([
    fetch(createR2PresignedUrl("DELETE", media.original_key, 60), { method: "DELETE" }),
    fetch(createR2PresignedUrl("DELETE", media.preview_key, 60), { method: "DELETE" }),
  ]);

  const { error } = await supabase.from("album_media").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No pudimos eliminar el archivo." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
