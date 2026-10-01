import { legacyPrepareUpload } from "@/lib/album/legacy-upload";
import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createR2PresignedUrl } from "@/lib/r2/signing";
import { apiError, getAlbum, hashToken, publicMedia, requireGuest, requireUuid, sameOrigin } from "@/lib/album/server";

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

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const albumId = String(body.albumId || "");
    const filename = String(body.filename || "");
    const mimeType = inferMime(filename, String(body.mimeType || ""));
    const fileSize = Number(body.fileSize || 0);

    if (!filename || !mimeType || !Number.isInteger(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Datos de archivo incompletos." }, { status: 400 });
    }
    const album = await getAlbum(albumId);
    if (album.max_uploads_per_guest === undefined)
      return legacyPrepareUpload(
        new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }),
      );
    const clientUploadId = requireUuid(body.clientUploadId);
    const guest = await requireGuest(albumId);
    const admin = createAdminClient();
    if (!album.uploads_enabled) return NextResponse.json({ error: "Las cargas están pausadas." }, { status: 403 });

    const isPhoto = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "image/avif",
    ].includes(mimeType);
    const isVideo = ["video/mp4", "video/quicktime", "video/webm"].includes(mimeType);

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
    const uploadTokenHash = hashToken(uploadToken);
    const safeFilename = cleanName(filename);
    const prefix = `weddings/${album.wedding_id}/${album.id}`;
    const originalKey = `${prefix}/originals/${mediaId}-${safeFilename}`;
    const previewKey = `${prefix}/previews/${mediaId}.webp`;
    // Check R2 configuration before reserving quota.
    createR2PresignedUrl("PUT", originalKey, 600);
    const { data: reserved, error } = await admin.rpc("album_reserve_upload", {
      p_guest_id: guest.id,
      p_media: {
        id: mediaId,
        client_upload_id: clientUploadId,
        media_type: isVideo ? "video" : "photo",
        original_filename: filename.slice(0, 255),
        mime_type: mimeType.slice(0, 120),
        file_size_bytes: fileSize,
        original_key: originalKey,
        preview_key: previewKey,
        upload_token_hash: uploadTokenHash,
      },
    });
    if (error) throw error;
    const media = Array.isArray(reserved) ? reserved[0] : reserved;
    if (media.upload_state === "ready") return NextResponse.json({ alreadyUploaded: true, media: publicMedia(media) });
    return NextResponse.json({
      mediaId: media.id,
      uploadToken,
      originalUploadUrl: createR2PresignedUrl("PUT", media.original_key, 600),
      previewUploadUrl: createR2PresignedUrl("PUT", media.preview_key, 600),
      moderationStatus: media.moderation_status,
    });
  } catch (error) {
    return apiError(error);
  }
}
