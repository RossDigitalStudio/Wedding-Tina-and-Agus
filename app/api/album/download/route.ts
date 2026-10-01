import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createR2PresignedUrl } from "@/lib/r2/signing";
import { AlbumError, apiError, requireUuid } from "@/lib/album/server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const albumId = requireUuid(params.get("albumId"));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AlbumError("No autorizado.", 401);
    const { data: album } = await supabase
      .from("wedding_albums")
      .select("wedding_id, slug")
      .eq("id", albumId)
      .maybeSingle();
    if (!album) throw new AlbumError("Álbum no encontrado.", 404);
    const { data: member } = await supabase
      .from("wedding_members")
      .select("wedding_id")
      .eq("wedding_id", album.wedding_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) throw new AlbumError("No autorizado.", 403);
    let query = createAdminClient()
      .from("album_media")
      .select("id, original_key, original_filename")
      .eq("album_id", albumId)
      .eq("upload_state", "ready")
      .order("created_at");
    if (params.get("favorites") === "1") query = query.eq("favorite", true);
    const { data: media, error } = await query.limit(1000);
    if (error) throw error;
    if (!media?.length) throw new AlbumError("No hay recuerdos para descargar.", 404);
    const archive = archiver("zip", { store: true });
    const output = new PassThrough();
    archive.on("error", (error) => output.destroy(error));
    archive.on("warning", (error) => output.destroy(error));
    archive.pipe(output);
    request.signal.addEventListener("abort", () => {
      archive.abort();
      output.destroy();
    });
    // Stream files one by one; never keep the complete album in memory.
    (async () => {
      try {
        for (const item of media) {
          if (request.signal.aborted) break;
          const response = await fetch(createR2PresignedUrl("GET", item.original_key, 300), { signal: request.signal });
          if (!response.ok || !response.body) throw new Error(`No pudimos descargar ${item.original_filename}`);
          const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
          const consumed = new Promise<void>((resolve, reject) => {
            stream.on("end", resolve);
            stream.on("error", reject);
          });
          const name = item.original_filename.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(-120);
          archive.append(stream, { name: `${item.id.slice(0, 8)}-${name}` });
          await consumed;
        }
        await archive.finalize();
      } catch (error) {
        archive.abort();
        output.destroy(error instanceof Error ? error : new Error("Descarga interrumpida"));
      }
    })();
    const name = album.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(Readable.toWeb(output) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}${params.get("favorites") === "1" ? "-favoritas" : ""}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
