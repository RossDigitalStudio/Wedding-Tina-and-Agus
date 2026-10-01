import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, hashToken, requireGuest, requireUuid, sameOrigin } from "@/lib/album/server";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const guest = await requireGuest(requireUuid(body.albumId));
    const { error } = await createAdminClient()
      .from("album_media")
      .update({ upload_state: "failed", upload_token_hash: null })
      .eq("id", requireUuid(body.mediaId))
      .eq("guest_id", guest.id)
      .eq("upload_state", "uploading")
      .eq("upload_token_hash", hashToken(String(body.uploadToken || "")));
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
