import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mediaId = String(body.mediaId || "");
    const uploadToken = String(body.uploadToken || "");
    const width = Number(body.width || 0) || null;
    const height = Number(body.height || 0) || null;
    const durationSeconds = Number(body.durationSeconds || 0) || null;

    if (!mediaId || !uploadToken) {
      return NextResponse.json({ error: "Carga inválida." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: media, error } = await admin
      .from("album_media")
      .select("id, upload_state, upload_token_hash, media_type, album_id")
      .eq("id", mediaId)
      .maybeSingle();

    if (error || !media || !media.upload_token_hash || media.upload_state !== "uploading") {
      return NextResponse.json({ error: "La carga ya no está disponible." }, { status: 404 });
    }

    const candidateHash = createHash("sha256").update(uploadToken).digest("hex");
    if (!safeEqual(candidateHash, media.upload_token_hash)) {
      return NextResponse.json({ error: "Token de carga inválido." }, { status: 403 });
    }

    const { data: album } = await admin.from("wedding_albums").select("max_video_seconds").eq("id", media.album_id).single();
    if (media.media_type === "video" && durationSeconds && album && durationSeconds > album.max_video_seconds) {
      return NextResponse.json({ error: `El video supera el máximo de ${album.max_video_seconds} segundos.` }, { status: 413 });
    }

    const { data: updated, error: updateError } = await admin
      .from("album_media")
      .update({
        upload_state: "ready",
        width,
        height,
        duration_seconds: durationSeconds,
        uploaded_at: new Date().toISOString(),
        upload_token_hash: null,
      })
      .eq("id", mediaId)
      .select("id, album_id, wedding_id, media_type, guest_name, original_filename, mime_type, file_size_bytes, preview_mime_type, upload_state, moderation_status, show_in_gallery, show_in_live, favorite, width, height, duration_seconds, uploaded_at, created_at, updated_at")
      .single();

    if (updateError) {
      console.error(updateError);
      return NextResponse.json({ error: "No pudimos completar la carga." }, { status: 500 });
    }

    return NextResponse.json({ media: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No pudimos completar la carga." }, { status: 500 });
  }
}
