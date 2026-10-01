// Compatibility while migration 005 is pending. Removed from the path automatically once the new schema exists.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createR2PresignedUrl } from "@/lib/r2/signing";

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "archivo";
}

function inferMime(filename: string, provided: string) {
  if (provided && provided !== "application/octet-stream") return provided;
  const extension = filename.toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return (extension && map[extension]) || provided || "application/octet-stream";
}

export async function legacyPrepareUpload(request: Request) {
  try {
    const body = await request.json();
    const albumId = String(body.albumId || "");
    const filename = String(body.filename || "");
    const mimeType = inferMime(filename, String(body.mimeType || ""));
    const fileSize = Number(body.fileSize || 0);
    const guestName =
      String(body.guestName || "")
        .trim()
        .slice(0, 80) || null;
    const uploaderSessionId = String(body.uploaderSessionId || "") || null;

    if (!albumId || !filename || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Datos de archivo incompletos." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: album, error: albumError } = await admin
      .from("wedding_albums")
      .select("*")
      .eq("id", albumId)
      .maybeSingle();

    if (albumError || !album || !album.is_active || !album.uploads_enabled) {
      return NextResponse.json({ error: "El álbum no está disponible para nuevas cargas." }, { status: 403 });
    }

    const isPhoto = mimeType.startsWith("image/");
    const isVideo = mimeType.startsWith("video/");

    if (!isPhoto && !isVideo) {
      return NextResponse.json({ error: "Ese tipo de archivo no está permitido." }, { status: 415 });
    }

    if (isVideo && !album.allow_videos) {
      return NextResponse.json({ error: "Los videos están desactivados en este álbum." }, { status: 403 });
    }

    const maxBytes = (isVideo ? album.max_video_mb : album.max_photo_mb) * 1024 * 1024;
    if (fileSize > maxBytes) {
      return NextResponse.json(
        { error: `El archivo supera el máximo de ${isVideo ? album.max_video_mb : album.max_photo_mb} MB.` },
        { status: 413 },
      );
    }

    const mediaId = randomUUID();
    const uploadToken = randomBytes(32).toString("hex");
    const uploadTokenHash = createHash("sha256").update(uploadToken).digest("hex");
    const safeFilename = cleanName(filename);
    const prefix = `weddings/${album.wedding_id}/${album.id}`;
    const originalKey = `${prefix}/originals/${mediaId}-${safeFilename}`;
    const previewKey = `${prefix}/previews/${mediaId}.webp`;
    const moderationStatus = album.moderation_enabled ? "pending" : "approved";

    const { error: insertError } = await admin.from("album_media").insert({
      id: mediaId,
      album_id: album.id,
      wedding_id: album.wedding_id,
      media_type: isVideo ? "video" : "photo",
      guest_name: guestName,
      uploader_session_id: uploaderSessionId,
      original_filename: filename.slice(0, 255),
      mime_type: mimeType.slice(0, 120),
      file_size_bytes: fileSize,
      preview_mime_type: "image/webp",
      original_key: originalKey,
      preview_key: previewKey,
      upload_state: "uploading",
      moderation_status: moderationStatus,
      show_in_gallery: true,
      show_in_live: true,
      favorite: false,
      upload_token_hash: uploadTokenHash,
    });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json({ error: "No pudimos preparar la carga." }, { status: 500 });
    }

    return NextResponse.json({
      mediaId,
      uploadToken,
      originalUploadUrl: createR2PresignedUrl("PUT", originalKey, 600),
      previewUploadUrl: createR2PresignedUrl("PUT", previewKey, 600),
      moderationStatus,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No pudimos preparar la carga." }, { status: 500 });
  }
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function legacyCompleteUpload(request: Request) {
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

    const { data: album } = await admin
      .from("wedding_albums")
      .select("max_video_seconds")
      .eq("id", media.album_id)
      .single();
    if (media.media_type === "video" && durationSeconds && album && durationSeconds > album.max_video_seconds) {
      return NextResponse.json(
        { error: `El video supera el máximo de ${album.max_video_seconds} segundos.` },
        { status: 413 },
      );
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
      .select(
        "id, album_id, wedding_id, media_type, guest_name, original_filename, mime_type, file_size_bytes, preview_mime_type, upload_state, moderation_status, show_in_gallery, show_in_live, favorite, width, height, duration_seconds, uploaded_at, created_at, updated_at",
      )
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
