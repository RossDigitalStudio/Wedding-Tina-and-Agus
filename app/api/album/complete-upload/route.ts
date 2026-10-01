import { legacyCompleteUpload } from "@/lib/album/legacy-upload";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AlbumError,
  apiError,
  hashToken,
  publicMedia,
  requireGuest,
  requireUuid,
  sameOrigin,
} from "@/lib/album/server";
import { createR2PresignedUrl } from "@/lib/r2/signing";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const mediaId = requireUuid(body.mediaId);
    const admin = createAdminClient();
    const { data: media, error } = await admin.from("album_media").select("*").eq("id", mediaId).maybeSingle();
    if (error) throw error;
    if (!media) throw new AlbumError("Carga inválida.", 404);
    if (!("guest_id" in media) || (media.guest_id === null && !body.albumId))
      return legacyCompleteUpload(
        new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }),
      );
    const guest = await requireGuest(requireUuid(body.albumId));
    if (media.guest_id !== guest.id) throw new AlbumError("Carga inválida.", 403);
    if (media.upload_state === "ready") return NextResponse.json({ media: publicMedia(media) });
    if (hashToken(String(body.uploadToken || "")) !== media.upload_token_hash)
      throw new AlbumError("Carga inválida.", 403);
    // An upload is ready only after both stored objects are present.
    const [original, preview] = await Promise.all([
      fetch(createR2PresignedUrl("HEAD", media.original_key, 60), { method: "HEAD" }),
      fetch(createR2PresignedUrl("HEAD", media.preview_key, 60), { method: "HEAD" }),
    ]);
    if (!original.ok || !preview.ok || Number(original.headers.get("content-length")) !== Number(media.file_size_bytes))
      throw new AlbumError("La carga está incompleta. Volvé a intentarlo.", 409);
    const width = Number(body.width),
      height = Number(body.height);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0)
      throw new AlbumError("Dimensiones inválidas.");
    const { data, error: finishError } = await admin.rpc("album_finish_upload", {
      p_guest_id: guest.id,
      p_media_id: mediaId,
      p_token_hash: media.upload_token_hash,
      p_width: width,
      p_height: height,
      p_duration: body.durationSeconds ?? null,
    });
    if (finishError) throw finishError;
    return NextResponse.json({ media: publicMedia(Array.isArray(data) ? data[0] : data) });
  } catch (error) {
    return apiError(error);
  }
}
