import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AlbumError, apiError, findGuest, getAlbum, guestCookie, hashToken, sameOrigin } from "@/lib/album/server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const album = await getAlbum(String(body.albumId || ""));
    const name = String(body.displayName || "")
      .trim()
      .slice(0, 80);
    if (!name) throw new AlbumError("Contanos cómo te llamás.");
    const instagram = String(body.instagramHandle || "")
      .trim()
      .replace(/^@/, "");
    if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram))
      throw new AlbumError("Ingresá tu usuario de Instagram, sin enlaces ni espacios.");
    const existing = await findGuest(album.id);
    const social = album.people_enabled && body.socialEnabled === true;
    const adult = body.isAdult === true;
    const sparks = social && album.sparks_enabled && adult && body.sparksEnabled === true;
    if (body.sparksEnabled === true && !adult)
      throw new AlbumError("Confirmá que tenés 18 años o más para participar en Chispas.");
    const token = randomBytes(32).toString("hex");
    const patch = {
      display_name: name,
      instagram_handle: instagram || null,
      social_enabled: social,
      sparks_enabled: sparks,
      is_adult: adult,
      last_seen_at: new Date().toISOString(),
    };
    const admin = createAdminClient();
    const result = existing
      ? await admin.from("album_guests").update(patch).eq("id", existing.id).select("id").single()
      : await admin
          .from("album_guests")
          .insert({ ...patch, album_id: album.id, session_token_hash: hashToken(token) })
          .select("id")
          .single();
    if (result.error) throw result.error;
    const response = NextResponse.json({ ok: true, guestId: result.data.id });
    response.headers.set("Cache-Control", "no-store");
    if (!existing)
      response.cookies.set(guestCookie(album.id), token, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 730,
      });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
