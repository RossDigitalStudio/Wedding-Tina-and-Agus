import { renderAlbum } from "@/lib/album/public-page";
export const dynamic = "force-dynamic";
export default async function AlbumPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderAlbum((await params).slug);
}
