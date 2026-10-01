import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createR2PresignedUrl } from "@/lib/r2/signing";
import { AlbumError, apiError, findGuest, getAlbum, requireGuest, requireUuid, sameOrigin } from "@/lib/album/server";
import { randomUUID } from "crypto";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const form = await request.formData();
    const album = await getAlbum(String(form.get("albumId") || ""));
    const me = await requireGuest(album.id);
    const file = form.get("photo");
    if (
      !(file instanceof File) ||
      file.size > 2 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new AlbumError("Elegí un JPG, PNG o WebP de hasta 2 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid =
      file.type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : file.type === "image/png"
          ? bytes.slice(0, 8).join() === "137,80,78,71,13,10,26,10"
          : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!valid) throw new AlbumError("No pudimos leer esa imagen.");
    const key = `weddings/${album.wedding_id}/${album.id}/profiles/${me.id}-${randomUUID()}`;
    const upload = await fetch(createR2PresignedUrl("PUT", key, 60), {
      method: "PUT",
      body: bytes,
      headers: { "Content-Type": file.type },
    });
    if (!upload.ok) throw new Error("Profile upload failed");
    const { error } = await createAdminClient().from("album_guests").update({ profile_photo_key: key }).eq("id", me.id);
    if (error) throw error;
    if (me.profile_photo_key)
      await fetch(createR2PresignedUrl("DELETE", me.profile_photo_key, 60), { method: "DELETE" }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const album = await getAlbum(params.get("albumId") || "");
    const id = requireUuid(params.get("guestId"));
    const me = await findGuest(album.id);
    const { data, error } = await createAdminClient()
      .from("album_guests")
      .select("profile_photo_key, social_enabled, blocked")
      .eq("id", id)
      .eq("album_id", album.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.profile_photo_key || data.blocked || (id !== me?.id && (!album.people_enabled || !data.social_enabled)))
      throw new AlbumError("Foto no encontrada.", 404);
    return NextResponse.redirect(createR2PresignedUrl("GET", data.profile_photo_key, 60), {
      status: 307,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
