import { renderLiveAlbum } from "@/lib/album/live-page";
export const dynamic = "force-dynamic";
export default async function AlbumLivePage() {
  return renderLiveAlbum();
}
