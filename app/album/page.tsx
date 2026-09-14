import { AlbumClient } from "@/components/album/album-client";
import type { AlbumMedia, AlbumMission, WeddingAlbum } from "@/lib/album/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicAlbumPage() {
  const supabase = await createClient();
  const { data: album } = await supabase
    .from("wedding_albums")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!album) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--cream)] p-6 text-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--moss)]">Álbum digital</p>
          <h1 className="mt-3 font-serif text-4xl">El álbum todavía no está disponible.</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">Volvé a intentar más cerca de la fiesta.</p>
        </div>
      </main>
    );
  }

  const [missionsResult, mediaResult] = await Promise.all([
    supabase.from("album_missions").select("*").eq("album_id", album.id).eq("active", true).order("sort_order"),
    supabase
      .from("album_media")
      .select("id, album_id, wedding_id, media_type, guest_name, original_filename, mime_type, file_size_bytes, preview_mime_type, upload_state, moderation_status, show_in_gallery, show_in_live, favorite, width, height, duration_seconds, uploaded_at, created_at, updated_at")
      .eq("album_id", album.id)
      .eq("upload_state", "ready")
      .eq("moderation_status", "approved")
      .eq("show_in_gallery", true)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  return (
    <AlbumClient
      album={album as WeddingAlbum}
      missions={(missionsResult.data || []) as AlbumMission[]}
      initialMedia={(mediaResult.data || []) as AlbumMedia[]}
    />
  );
}
