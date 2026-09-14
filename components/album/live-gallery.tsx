"use client";

import { Camera, Heart, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { albumMediaUrl, quickChartQrUrl } from "@/lib/album/utils";
import type { AlbumMedia, WeddingAlbum } from "@/lib/album/types";

export function LiveGallery({
  album,
  initialMedia,
  publicUrl,
}: {
  album: WeddingAlbum;
  initialMedia: AlbumMedia[];
  publicUrl: string;
}) {
  const [media, setMedia] = useState(initialMedia);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!media.length) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % media.length);
    }, Math.max(3, album.live_interval_seconds) * 1000);
    return () => window.clearInterval(timer);
  }, [album.live_interval_seconds, media.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-album-${album.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "album_media", filter: `album_id=eq.${album.id}` },
        (payload) => {
          const next = payload.new as AlbumMedia;
          if (!next?.id) return;
          const visible = next.upload_state === "ready" && next.moderation_status === "approved" && next.show_in_live;
          setMedia((current) => {
            if (!visible) return current.filter((item) => item.id !== next.id);
            const without = current.filter((item) => item.id !== next.id);
            return [next, ...without].slice(0, 500);
          });
          if (visible) setIndex(0);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [album.id]);

  const current = useMemo(() => media[index] || media[0] || null, [index, media]);
  const qrUrl = quickChartQrUrl(publicUrl, 300);

  return (
    <main className="relative h-screen overflow-hidden bg-[#0c0d0b] text-white">
      {current ? (
        <>
          <div
            key={`bg-${current.id}`}
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-3xl transition-all duration-700"
            style={{ backgroundImage: `url(${albumMediaUrl(current.id)})` }}
          />
          <div className="absolute inset-0 bg-black/40" />
          <div key={current.id} className="absolute inset-0 flex items-center justify-center p-6 pb-32 pr-80 animate-[fadeIn_.7s_ease-out]">
            <img src={albumMediaUrl(current.id)} alt="Foto compartida" className="max-h-full max-w-full rounded-3xl object-contain shadow-2xl" />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pr-80">
          <div className="text-center">
            <Camera size={54} className="mx-auto text-white/35" />
            <h1 className="mt-5 font-serif text-5xl">Esperando el primer recuerdo</h1>
            <p className="mt-3 text-lg text-white/45">Escaneá el QR y subí una foto.</p>
          </div>
        </div>
      )}

      <aside className="absolute inset-y-0 right-0 flex w-72 flex-col justify-between border-l border-white/10 bg-black/65 p-6 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/45"><Heart size={14} fill="currentColor" /> Nuestro álbum</div>
          <h1 className="mt-3 font-serif text-4xl leading-none">{album.title}</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">La fiesta vista desde todos los puntos de vista.</p>
        </div>

        <div className="rounded-3xl bg-white p-4 text-[var(--ink)]">
          <img src={qrUrl} alt={`QR para ${publicUrl}`} className="aspect-square w-full" />
          <div className="mt-3 flex items-start gap-2">
            <QrCode size={18} className="mt-0.5 shrink-0 text-[var(--moss)]" />
            <div>
              <p className="text-sm font-bold">Subí tus fotos</p>
              <p className="mt-1 break-all text-[10px] leading-4 text-[var(--muted)]">{publicUrl}</p>
            </div>
          </div>
        </div>

        <div className="text-xs text-white/35">{media.length} recuerdos compartidos</div>
      </aside>

      {current ? (
        <div className="absolute bottom-5 left-6 rounded-full bg-black/45 px-4 py-2 text-sm backdrop-blur">
          {album.show_guest_names && current.guest_name ? `Compartida por ${current.guest_name}` : "Agustina & Agustín · 23.10.2027"}
        </div>
      ) : null}
    </main>
  );
}
