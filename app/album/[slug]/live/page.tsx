import { renderLiveAlbum } from "@/lib/album/live-page";
export const dynamic = "force-dynamic";
export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  return renderLiveAlbum((await params).slug);
}
