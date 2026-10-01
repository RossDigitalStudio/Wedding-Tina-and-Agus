import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, galleryOpen, getAlbum, PUBLIC_MEDIA_FIELDS } from "@/lib/album/server";
export async function GET(request: Request) {
  try {
    const album = await getAlbum(new URL(request.url).searchParams.get("albumId") || "");
    const { data, error } = galleryOpen(album)
      ? await createAdminClient()
          .from("album_media")
          .select(PUBLIC_MEDIA_FIELDS)
          .eq("album_id", album.id)
          .eq("upload_state", "ready")
          .eq("moderation_status", "approved")
          .eq("show_in_gallery", true)
          .order("created_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };
    if (error) throw error;
    return NextResponse.json({ album, media: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
