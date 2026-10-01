import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AlbumError, apiError, requireUuid } from "@/lib/album/server";
export async function GET(request: Request) {
  try {
    const albumId = requireUuid(new URL(request.url).searchParams.get("albumId"));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AlbumError("No autorizado.", 401);
    const { data: album } = await supabase.from("wedding_albums").select("wedding_id").eq("id", albumId).maybeSingle();
    if (!album) throw new AlbumError("Álbum no encontrado.", 404);
    const { data: member } = await supabase
      .from("wedding_members")
      .select("wedding_id")
      .eq("wedding_id", album.wedding_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) throw new AlbumError("No autorizado.", 403);
    const { data: sparks, error } = await createAdminClient()
      .from("album_sparks")
      .select("from_guest_id, to_guest_id")
      .eq("album_id", albumId);
    if (error) throw error;
    const edges = new Set((sparks || []).map((s) => `${s.from_guest_id}:${s.to_guest_id}`));
    return NextResponse.json(
      {
        sparks: sparks?.length || 0,
        matches: (sparks || []).filter((s) => edges.has(`${s.to_guest_id}:${s.from_guest_id}`)).length / 2,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
