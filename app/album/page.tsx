import { renderAlbum } from "@/lib/album/public-page";
export const dynamic = "force-dynamic";
export default async function PublicAlbumPage() {
  return renderAlbum();
}
