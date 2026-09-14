import { LiveGallery } from "@/components/album/live-gallery";
import type { AlbumMedia, WeddingAlbum } from "@/lib/album/types";
import { publicAlbumUrl } from "@/lib/album/utils";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AlbumLivePage() {
  const supabase = await createClient();
  const { data: album } = await supabase
    .from("wedding_albums")
    .select("*")
    .eq("is_active", true)
    .eq("live_enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!album) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-white">La pantalla en vivo está desactivada.</main>;
  }

  const { data: media } = await supabase
    .from("album_media")
    .select("id, album_id, wedding_id, media_type, guest_name, original_filename, mime_type, file_size_bytes, preview_mime_type, upload_state, moderation_status, show_in_gallery, show_in_live, favorite, width, height, duration_seconds, uploaded_at, created_at, updated_at")
    .eq("album_id", album.id)
    .eq("upload_state", "ready")
    .eq("moderation_status", "approved")
    .eq("show_in_live", true)
    .order("created_at", { ascending: false })
    .limit(500);

  return <LiveGallery album={album as WeddingAlbum} initialMedia={(media || []) as AlbumMedia[]} publicUrl={publicAlbumUrl()} />;
}
