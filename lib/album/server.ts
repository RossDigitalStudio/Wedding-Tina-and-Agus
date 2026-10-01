import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WeddingAlbum } from "./types";

export class AlbumError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const guestCookie = (albumId: string) => `aa-album-${albumId}`;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireUuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new AlbumError("Identificador inválido.");
  return value;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AlbumError("Solicitud no autorizada.", 403);
}
export async function getAlbum(albumId: string) {
  requireUuid(albumId);
  const admin = createAdminClient();
  const { data, error } = await admin.from("wedding_albums").select("*").eq("id", albumId).maybeSingle();
  if (error) throw error;
  if (!data?.is_active) throw new AlbumError("El álbum no está disponible.", 404);
  return data as WeddingAlbum;
}
export async function findGuest(albumId: string) {
  const token = (await cookies()).get(guestCookie(albumId))?.value;
  if (!token) return null;
  const { data, error } = await createAdminClient()
    .from("album_guests")
    .select("*")
    .eq("album_id", albumId)
    .eq("session_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (data?.blocked) throw new AlbumError("Tu participación en este álbum está pausada. Consultá con A&A.", 403);
  return data;
}
export async function requireGuest(albumId: string) {
  const guest = await findGuest(albumId);
  if (!guest) throw new AlbumError("Primero ingresá tu nombre para entrar al álbum.", 401);
  return guest;
}
export function galleryOpen(album: WeddingAlbum) {
  return (
    album.gallery_enabled && (!album.gallery_reveal_at || new Date(album.gallery_reveal_at).getTime() <= Date.now())
  );
}
export function apiError(error: unknown) {
  if (error instanceof AlbumError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const known: Record<string, string> = {
    GUEST_LIMIT: "¡Completaste tu rollo! Ya alcanzaste el cupo de recuerdos.",
    GUEST_BLOCKED: "Tu participación está pausada. Consultá con A&A.",
    UPLOADS_PAUSED: "Las cargas están pausadas.",
    UPLOAD_EXPIRED: "La carga venció. Volvé a intentarlo.",
    INVALID_UPLOAD: "La carga ya no está disponible. Volvé a intentarlo.",
    VIDEO_DURATION: "El video supera la duración permitida.",
  };
  for (const [code, text] of Object.entries(known))
    if (message.includes(code))
      return NextResponse.json({ error: text, code }, { status: code === "GUEST_LIMIT" ? 409 : 403 });
  console.error("Album API:", error);
  if (/album_guests|album_reserve_upload|schema cache|does not exist/.test(message))
    return NextResponse.json(
      { error: "Estamos preparando el álbum. Volvé a intentar en unos minutos.", code: "MIGRATION_REQUIRED" },
      { status: 503 },
    );
  return NextResponse.json({ error: "No pudimos completar la solicitud. Volvé a intentar." }, { status: 500 });
}
// Never return object keys, hashes or upload tokens through public JSON responses.
export const PUBLIC_MEDIA_FIELDS =
  "id, album_id, wedding_id, guest_id, media_type, guest_name, original_filename, mime_type, file_size_bytes, preview_mime_type, upload_state, moderation_status, show_in_gallery, show_in_live, favorite, width, height, duration_seconds, uploaded_at, created_at, updated_at";
export function publicMedia(row: Record<string, unknown>) {
  return Object.fromEntries(PUBLIC_MEDIA_FIELDS.split(", ").map((key) => [key, row[key]]));
}
