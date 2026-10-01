import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AlbumError,
  apiError,
  findGuest,
  galleryOpen,
  getAlbum,
  requireGuest,
  requireUuid,
  sameOrigin,
} from "@/lib/album/server";

export async function GET(request: Request) {
  try {
    const album = await getAlbum(new URL(request.url).searchParams.get("albumId") || "");
    const me = await findGuest(album.id);
    const admin = createAdminClient();
    // Contacts and incoming one-way sparks never leave the server.
    const [guestResult, mediaResult, sentResult, incomingResult, likeResult] = await Promise.all([
      album.people_enabled
        ? admin
            .from("album_guests")
            .select("id, display_name, social_enabled, sparks_enabled, profile_photo_key")
            .eq("album_id", album.id)
            .eq("social_enabled", true)
            .eq("blocked", false)
            .order("joined_at")
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("album_media")
        .select("id, guest_id, upload_state, moderation_status, show_in_gallery, updated_at")
        .eq("album_id", album.id),
      me && album.sparks_enabled
        ? admin.from("album_sparks").select("to_guest_id").eq("album_id", album.id).eq("from_guest_id", me.id)
        : Promise.resolve({ data: [], error: null }),
      me && me.sparks_enabled && album.sparks_enabled
        ? admin.from("album_sparks").select("from_guest_id").eq("album_id", album.id).eq("to_guest_id", me.id)
        : Promise.resolve({ data: [], error: null }),
      album.likes_enabled && galleryOpen(album)
        ? admin.from("album_likes").select("media_id, guest_id").eq("album_id", album.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [guestResult, mediaResult, sentResult, incomingResult, likeResult])
      if (result.error) throw result.error;
    const rows = mediaResult.data || [];
    const visible = galleryOpen(album)
      ? rows.filter((m) => m.upload_state === "ready" && m.moderation_status === "approved" && m.show_in_gallery)
      : [];
    const visibleIds = new Set(visible.map((m) => m.id));
    const sent = new Set((sentResult.data || []).map((s) => s.to_guest_id));
    const incoming = new Set((incomingResult.data || []).map((s) => s.from_guest_id));
    const guests = (guestResult.data || []).map((g) => ({
      id: g.id,
      display_name: g.display_name,
      social_enabled: g.social_enabled,
      sparks_enabled: g.sparks_enabled && album.sparks_enabled,
      has_photo: !!g.profile_photo_key,
      photo_count: visible.filter((m) => m.guest_id === g.id).length,
      sent_spark: sent.has(g.id),
    }));
    const matchedIds = me?.sparks_enabled
      ? guests.filter((g) => g.sparks_enabled && sent.has(g.id) && incoming.has(g.id)).map((g) => g.id)
      : [];
    const contacts =
      album.instagram_on_match && matchedIds.length
        ? await admin.from("album_guests").select("id, instagram_handle").in("id", matchedIds)
        : { data: [], error: null };
    if (contacts.error) throw contacts.error;
    const matches = guests
      .filter((g) => matchedIds.includes(g.id))
      .map((g) => ({ ...g, instagram_handle: contacts.data?.find((c) => c.id === g.id)?.instagram_handle || null }));
    const likes: Record<string, { count: number; liked: boolean }> = {};
    for (const like of likeResult.data || []) {
      if (!visibleIds.has(like.media_id)) continue;
      const value = (likes[like.media_id] ||= { count: 0, liked: false });
      value.count++;
      if (like.guest_id === me?.id) value.liked = true;
    }
    const used = me
      ? rows.filter(
          (m) =>
            m.guest_id === me.id &&
            (m.upload_state === "ready" ||
              (m.upload_state === "uploading" && Date.parse(m.updated_at) > Date.now() - 86400000)),
        ).length
      : 0;
    return NextResponse.json(
      {
        me: me
          ? {
              id: me.id,
              display_name: me.display_name,
              social_enabled: me.social_enabled,
              sparks_enabled: me.sparks_enabled,
              is_adult: me.is_adult,
              instagram_handle: me.instagram_handle,
              has_photo: !!me.profile_photo_key,
              photo_count: visible.filter((m) => m.guest_id === me.id).length,
            }
          : null,
        guests,
        matches,
        likes,
        uploads_used: used,
        remaining: album.max_uploads_per_guest > 0 ? Math.max(0, album.max_uploads_per_guest - used) : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const album = await getAlbum(String(body.albumId || ""));
    const me = await requireGuest(album.id);
    const targetId = requireUuid(body.targetId);
    const admin = createAdminClient();
    if (body.action === "spark") {
      if (!album.people_enabled || !album.sparks_enabled || !me.social_enabled || !me.sparks_enabled || !me.is_adult)
        throw new AlbumError("Activá Chispas en tu perfil para participar.", 403);
      if (targetId === me.id) throw new AlbumError("Elegí a otra persona.");
      const { data: target, error } = await admin
        .from("album_guests")
        .select("id")
        .eq("album_id", album.id)
        .eq("id", targetId)
        .eq("social_enabled", true)
        .eq("sparks_enabled", true)
        .eq("is_adult", true)
        .eq("blocked", false)
        .maybeSingle();
      if (error) throw error;
      if (!target) throw new AlbumError("Esta persona no participa en Chispas.", 404);
      const result =
        body.enabled === false
          ? await admin
              .from("album_sparks")
              .delete()
              .eq("album_id", album.id)
              .eq("from_guest_id", me.id)
              .eq("to_guest_id", targetId)
          : await admin
              .from("album_sparks")
              .upsert(
                { album_id: album.id, from_guest_id: me.id, to_guest_id: targetId },
                { onConflict: "album_id,from_guest_id,to_guest_id", ignoreDuplicates: true },
              );
      if (result.error) throw result.error;
    } else if (body.action === "like" || body.action === "report-media") {
      if (!galleryOpen(album)) throw new AlbumError("La galería todavía no está disponible.", 403);
      const { data: target, error } = await admin
        .from("album_media")
        .select("id")
        .eq("id", targetId)
        .eq("album_id", album.id)
        .eq("upload_state", "ready")
        .eq("moderation_status", "approved")
        .eq("show_in_gallery", true)
        .maybeSingle();
      if (error) throw error;
      if (!target) throw new AlbumError("Recuerdo no encontrado.", 404);
      if (body.action === "like") {
        if (!album.likes_enabled) throw new AlbumError("Los likes están desactivados.", 403);
        const result =
          body.enabled === false
            ? await admin.from("album_likes").delete().eq("guest_id", me.id).eq("media_id", targetId)
            : await admin
                .from("album_likes")
                .upsert(
                  { album_id: album.id, guest_id: me.id, media_id: targetId },
                  { onConflict: "media_id,guest_id", ignoreDuplicates: true },
                );
        if (result.error) throw result.error;
      } else await report("media_id");
    } else if (body.action === "report-guest") {
      if (!album.people_enabled) throw new AlbumError("La sección está desactivada.", 403);
      const { data: target, error } = await admin
        .from("album_guests")
        .select("id")
        .eq("id", targetId)
        .eq("album_id", album.id)
        .eq("social_enabled", true)
        .eq("blocked", false)
        .maybeSingle();
      if (error) throw error;
      if (!target || targetId === me.id) throw new AlbumError("Persona no encontrada.", 404);
      await report("reported_guest_id");
    } else throw new AlbumError("Acción inválida.");
    async function report(column: "media_id" | "reported_guest_id") {
      const reason = String(body.reason || "")
        .trim()
        .slice(0, 300);
      if (!reason) throw new AlbumError("Contanos el motivo del reporte.");
      const { error } = await admin
        .from("album_reports")
        .insert({ album_id: album.id, reporter_guest_id: me.id, [column]: targetId, reason });
      if (error && error.code !== "23505") throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
