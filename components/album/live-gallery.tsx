"use client";

import { Camera, ChevronLeft, ChevronRight, Heart, Maximize, Minimize, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { albumMediaUrl, quickChartQrUrl } from "@/lib/album/utils";
import type { AlbumMedia, WeddingAlbum } from "@/lib/album/types";

function BotanicalSprig() {
  return (
    <svg viewBox="0 0 200 300" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M36 286C44 213 96 151 143 22M63 213C77 185 114 181 156 145M94 150C90 118 65 82 60 51" />
      <path d="M47 252C18 236 10 204 16 188C46 193 56 221 47 252ZM66 216C92 222 130 201 136 178C106 170 77 187 66 216ZM82 180C55 165 46 139 52 118C77 121 90 147 82 180ZM107 130C136 136 162 115 171 92C142 87 119 106 107 130ZM119 102C97 87 93 64 102 46C127 55 132 75 119 102ZM136 54C152 42 164 21 160 8C140 12 132 33 136 54ZM68 75C44 73 27 53 28 36C52 38 66 53 68 75ZM134 166C151 171 176 161 185 144C164 138 146 150 134 166Z" />
    </svg>
  );
}

export function LiveGallery({ album, initialMedia, publicUrl }: {
  album: WeddingAlbum;
  initialMedia: AlbumMedia[];
  publicUrl: string;
}) {
  const [media, setMedia] = useState(initialMedia);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const pausedRef = useRef(paused);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const intervalSeconds = Math.max(3, album.live_interval_seconds);
  const current = useMemo(() => media[index % (media.length || 1)] || null, [index, media]);
  const currentUrl = current ? `${albumMediaUrl(current.id, current.media_type === "video" ? "original" : "preview")}&surface=live` : "";
  const initials = album.title.split(/\s*[&+]\s*/).slice(0, 2).map((name) => name.trim().charAt(0)).join(" & ");
  const date = album.event_date ? new Date(`${album.event_date.slice(0, 10)}T12:00:00Z`) : null;
  const eventDate = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date).replaceAll("/", ".")
    : "";

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  }, []);

  useEffect(() => () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); }, []);

  const move = useCallback((direction: number) => {
    if (!media.length) return;
    setIndex((value) => ((value % media.length) + direction + media.length) % media.length);
  }, [media.length]);

  const toggleFullscreen = useCallback(async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen();
      else setFullscreenError("Usá la opción de pantalla completa de tu navegador.");
    } catch {
      setFullscreenError("No se pudo abrir la pantalla completa. Podés usar F11 en tu navegador.");
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement)?.closest("button, a, input, textarea, select")) return;
      if ([" ", "ArrowRight", "ArrowLeft", "f", "F"].includes(event.key)) {
        event.preventDefault();
        revealControls();
        if (event.key === " ") setPaused((value) => !value);
        else if (event.key === "ArrowRight") move(1);
        else if (event.key === "ArrowLeft") move(-1);
        else void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, revealControls, toggleFullscreen]);

  useEffect(() => {
    if (paused || media.length < 2) return;
    const timer = window.setInterval(() => move(1), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [intervalSeconds, paused, move, current?.id, media.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`live-album-${album.id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "album_media", filter: `album_id=eq.${album.id}` },
      (payload) => {
        const next = payload.new as AlbumMedia;
        const deletedId = (payload.old as Partial<AlbumMedia>)?.id;
        if (payload.eventType === "DELETE") {
          if (deletedId) setMedia((items) => items.filter((item) => item.id !== deletedId));
          return;
        }
        if (!next?.id) return;
        const visible = next.upload_state === "ready" && next.moderation_status === "approved" && next.show_in_live;
        setMedia((items) => {
          if (!visible) return items.filter((item) => item.id !== next.id);
          const existingIndex = items.findIndex((item) => item.id === next.id);
          // While paused, keep the selected photo in place as new memories arrive.
          if (existingIndex !== -1) return items.map((item) => item.id === next.id ? next : item);
          return pausedRef.current ? [...items, next].slice(0, 500) : [next, ...items].slice(0, 500);
        });
        if (visible && !pausedRef.current) setIndex(0);
      },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [album.id]);

  return (
    <main ref={stageRef} className={`wedding-live ${controlsVisible ? "controls-visible" : ""}`} onPointerMove={revealControls} onPointerDown={revealControls} onFocusCapture={revealControls}>
      <div className="botanical botanical-left"><BotanicalSprig /></div>
      <div className="botanical botanical-right"><BotanicalSprig /></div>
      <div className="outer-border" aria-hidden="true" />

      <header className="live-header">
        <div className="live-eyebrow"><span /> Una noche para recordar <span /></div>
        <h1>{album.title}</h1>
        <div className="header-details">
          {eventDate && <span>{eventDate}</span>}
          {eventDate && <Heart size={10} fill="currentColor" aria-hidden="true" />}
          <span>Nuestros recuerdos, en vivo</span>
        </div>
      </header>

      <div className="live-layout">
        <section className="photo-stage" aria-label="Recuerdos compartidos">
          {current ? (
            <figure className="memory-frame" key={current.id}>
              <div className="memory-image">
                {current.media_type === "video" ? (
                  <video src={currentUrl} autoPlay={!paused} muted playsInline loop ref={(video) => { if (video) { if (paused) video.pause(); else void video.play().catch(() => {}); } }} aria-label="Video compartido por un invitado" />
                ) : (
                  <img src={currentUrl} alt={album.show_guest_names && current.guest_name ? `Recuerdo de ${current.guest_name}` : "Recuerdo de nuestra boda"} />
                )}
              </div>
              <figcaption>
                <span>{album.show_guest_names && current.guest_name ? `Desde los ojos de ${current.guest_name}` : "Un instante para siempre"}</span>
                <Heart size={13} aria-hidden="true" />
              </figcaption>
            </figure>
          ) : (
            <div className="empty-memory">
              <div className="empty-icon"><Camera size={32} strokeWidth={1} /></div>
              <p className="small-label">El comienzo de nuestro álbum</p>
              <h2>Los mejores recuerdos<br />los hacemos juntos.</h2>
              <p>Escaneá el QR y compartí la primera foto de esta noche.</p>
              <Heart size={19} strokeWidth={1} aria-hidden="true" />
            </div>
          )}
          <div className="photo-footer">
            <span className="small-label">Nuestra noche, desde tus ojos</span>
            {current && <span className="slide-number">{String((index % media.length) + 1).padStart(2, "0")} <span>/ {String(media.length).padStart(2, "0")}</span></span>}
          </div>
          {current && media.length > 1 && <div className="slide-progress" aria-hidden="true"><span key={`${current.id}-${intervalSeconds}`} style={{ animationDuration: `${intervalSeconds}s`, animationPlayState: paused ? "paused" : "running" }} /></div>}
        </section>

        <aside className="participation">
          <div className="monogram" aria-hidden="true">{initials || "♡"}</div>
          <div className="invitation-copy">
            <p className="small-label">Vos también sos parte</p>
            <h2>Regalanos<br />tu mirada.</h2>
            <p>Las risas, los abrazos, ese momento que solo vos viste.</p>
          </div>
          <a className="qr-card" href={publicUrl} target="_blank" rel="noreferrer" aria-label="Abrir el álbum para compartir tus fotos">
            <img src={quickChartQrUrl(publicUrl, 400)} alt="Escaneá este QR para compartir tus fotos en nuestro álbum" />
            <span>Escaneá y compartí tus fotos</span>
            <span className="qr-note">Sin cuenta ni contraseña</span>
          </a>
          <div className="shared-count"><Heart size={12} aria-hidden="true" /><span>{media.length} {media.length === 1 ? "recuerdo compartido" : "recuerdos compartidos"}</span></div>
          <p className="thank-you">Gracias por ser parte<br />de nuestra historia.</p>
        </aside>
      </div>

      <footer className="live-footer"><span /> Con amor, para siempre <span /></footer>
      <div className="live-controls" aria-label="Controles de la presentación">
        <button onClick={() => move(-1)} disabled={media.length < 2} aria-label="Recuerdo anterior" title="Anterior (←)"><ChevronLeft size={19} /></button>
        <button onClick={() => setPaused((value) => !value)} aria-label={paused ? "Reanudar presentación" : "Pausar presentación"} title={paused ? "Reanudar (espacio)" : "Pausar (espacio)"}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
        <button onClick={() => move(1)} disabled={media.length < 2} aria-label="Recuerdo siguiente" title="Siguiente (→)"><ChevronRight size={19} /></button>
        <span className="control-divider" />
        <button onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} title="Pantalla completa (F)">{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button>
      </div>
      {fullscreenError && <p className="fullscreen-error" role="status">{fullscreenError}</p>}

      <style jsx>{`
        .wedding-live { --live-paper: #f5efe3; --live-gold: #c5b38d; position: relative; isolation: isolate; display: flex; flex-direction: column; width: 100%; height: 100svh; min-height: 540px; overflow: hidden; color: var(--live-paper); background: radial-gradient(ellipse at 8% 8%, #39433066, transparent 48%), radial-gradient(ellipse at 100% 100%, #682f3b40, transparent 45%), #171c17; padding: clamp(24px, 3vh, 44px) clamp(28px, 4vw, 80px) 22px; }
        .outer-border { position: absolute; inset: 15px; border: 1px solid #c5b38d30; pointer-events: none; z-index: -1; }
        .botanical { position: absolute; width: clamp(120px, 15vw, 270px); color: #a9b492; opacity: .17; z-index: -1; pointer-events: none; }
        .botanical-left { left: -30px; top: -60px; transform: rotate(28deg); }
        .botanical-right { right: -40px; bottom: -90px; transform: rotate(208deg); }
        .live-header { text-align: center; flex-shrink: 0; padding-bottom: clamp(20px, 3vh, 36px); }
        .live-eyebrow, .small-label { font-size: 10px; line-height: 1.6; font-weight: 400; letter-spacing: .23em; text-transform: uppercase; color: var(--live-gold); }
        .live-eyebrow { display: flex; align-items: center; justify-content: center; gap: 18px; }
        .live-eyebrow span, .live-footer span { width: 38px; height: 1px; background: #c5b38d60; }
        h1, h2, .monogram, .thank-you, figcaption { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; }
        h1 { margin: 7px 0 10px; font-size: clamp(38px, 4.7vw, 80px); line-height: 1.1; letter-spacing: -.04em; }
        .header-details { display: flex; align-items: center; justify-content: center; gap: 14px; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #eee5d5a6; }
        .live-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) clamp(210px, 20vw, 320px); gap: clamp(34px, 5vw, 90px); width: min(100%, 1600px); margin: 0 auto; }
        .photo-stage { min-width: 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 0 0 12px; }
        .memory-frame { margin: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; padding: 12px 12px 0; border: 1px solid #c5b38d50; background: #f5efe3; box-shadow: 0 20px 70px #0005; animation: memory-reveal .9s ease both; }
        .memory-image { min-height: 0; flex: 1; position: relative; background: #1c221c; }
        .memory-image img, .memory-image video { display: block; width: 100%; height: 100%; object-fit: contain; position: absolute; inset: 0; }
        figcaption { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #4a4d3e; font-size: clamp(14px, 1.2vw, 20px); font-style: italic; padding: 10px 8px; }
        figcaption span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .photo-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; min-height: 20px; }
        .photo-footer .small-label { font-size: 9px; color: #d6cbb59e; }
        .slide-number { font-size: 12px; letter-spacing: .15em; color: #e8ddc8; font-variant-numeric: tabular-nums; }
        .slide-number span { color: #c5b38d80; }
        .slide-progress { height: 1px; background: #c5b38d20; margin-top: 10px; overflow: hidden; }
        .slide-progress span { display: block; height: 100%; width: 100%; transform-origin: left; background: #c5b38d90; animation: slide-time linear both; }
        .participation { min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .monogram { width: 64px; height: 64px; border: 1px solid #c5b38d60; border-radius: 50%; display: grid; place-items: center; color: var(--live-gold); font-size: 21px; font-style: italic; margin-bottom: clamp(12px, 2vh, 24px); }
        .invitation-copy h2 { font-size: clamp(28px, 2.7vw, 44px); line-height: 1.07; letter-spacing: -.03em; margin: 8px 0 13px; }
        .invitation-copy > p:last-child { font-size: clamp(11px, 1vw, 15px); line-height: 1.8; color: #eee5d5a6; max-width: 240px; margin: 0 auto; }
        .qr-card { display: flex; flex-direction: column; align-items: center; width: min(100%, 242px); padding: 12px 12px 15px; background: #fff; color: #343b2d; text-decoration: none; margin-top: clamp(16px, 2.5vh, 30px); box-shadow: 0 10px 30px #0002; outline-offset: 5px; }
        .qr-card img { display: block; width: 100%; height: auto; aspect-ratio: 1; }
        .qr-card > span { font-size: 11px; font-weight: 600; margin-top: 7px; }
        .qr-card .qr-note { color: #767b6b; font-size: 9px; font-weight: 400; margin-top: 5px; }
        .shared-count { display: flex; align-items: center; gap: 7px; color: #d6cbb5a6; font-size: 10px; margin-top: 17px; }
        .thank-you { font-size: clamp(16px, 1.5vw, 23px); font-style: italic; line-height: 1.4; color: #c5b38d; margin: 18px 0 0; }
        .live-footer { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 22px; font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: #c5b38d90; flex-shrink: 0; }
        .empty-memory { flex: 1; min-height: 0; border: 1px solid #c5b38d45; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; background: #f5efe306; }
        .empty-icon { border: 1px solid #c5b38d50; width: 76px; height: 76px; display: grid; place-items: center; border-radius: 50%; color: var(--live-gold); margin-bottom: 24px; }
        .empty-memory h2 { font-size: clamp(30px, 3.7vw, 58px); line-height: 1.15; margin: 14px 0; }
        .empty-memory > p:not(.small-label) { color: #eee5d5a6; font-size: 13px; line-height: 1.8; max-width: 320px; margin-bottom: 26px; }
        .live-controls { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(10px); display: flex; align-items: center; gap: 4px; border: 1px solid #c5b38d50; border-radius: 100px; padding: 5px 8px; background: #1a201aee; box-shadow: 0 8px 24px #0004; opacity: 0; transition: opacity .25s, transform .25s; }
        .controls-visible .live-controls, .live-controls:focus-within, .live-controls:hover { opacity: 1; transform: translateX(-50%) translateY(0); }
        .live-controls button { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: transparent; color: var(--live-paper); }
        .live-controls button:hover, .live-controls button:focus-visible { background: #c5b38d25; }
        .live-controls button:disabled { opacity: .3; cursor: default; }
        .control-divider { height: 18px; width: 1px; background: #c5b38d40; margin: 0 4px; }
        .fullscreen-error { position: absolute; bottom: 85px; left: 50%; transform: translateX(-50%); width: max-content; max-width: 90%; background: #1a201af5; border: 1px solid #c5b38d50; padding: 10px 16px; font-size: 12px; text-align: center; }
        @keyframes memory-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-time { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (max-height: 760px) and (min-width: 761px) { .monogram { display: none; } .qr-card { width: min(100%, 200px); margin-top: 15px; } .thank-you { margin-top: 12px; font-size: 17px; } .invitation-copy h2 { font-size: 32px; } .live-header { padding-bottom: 20px; } }
        @media (max-height: 580px) and (min-width: 761px) { .wedding-live { min-height: 360px; padding-top: 20px; } h1 { font-size: 34px; margin: 5px 0; } .live-eyebrow { font-size: 8px; } .live-header { padding-bottom: 14px; } .invitation-copy > p:last-child, .thank-you, .live-footer { display: none; } .invitation-copy h2 { font-size: 25px; margin-bottom: 4px; } .qr-card { width: 140px; padding: 6px; margin-top: 8px; } .qr-card > span { font-size: 9px; } .qr-card .qr-note { display: none; } .shared-count { margin-top: 9px; } }
        @media (max-width: 760px) { .wedding-live { height: auto; min-height: 100svh; overflow: visible; padding: 30px 26px 24px; } .outer-border { inset: 10px; } .live-header { padding-bottom: 24px; } h1 { font-size: clamp(32px, 7vw, 52px); } .live-eyebrow { font-size: 8px; gap: 10px; } .header-details { font-size: 8px; gap: 9px; } .live-layout { grid-template-columns: 1fr; gap: 25px; } .photo-stage { padding: 0; } .memory-frame { flex: none; } .memory-image { height: 48svh; min-height: 250px; flex: none; } .photo-footer .small-label { font-size: 8px; } .participation { display: grid; grid-template-columns: 1fr 142px; gap: 9px 18px; align-items: center; text-align: left; border-top: 1px solid #c5b38d30; padding-top: 23px; } .monogram, .thank-you { display: none; } .invitation-copy { grid-column: 1; grid-row: 1; } .invitation-copy .small-label { font-size: 8px; } .invitation-copy h2 { font-size: 29px; margin: 6px 0 10px; } .invitation-copy > p:last-child { font-size: 11px; margin: 0; } .qr-card { grid-column: 2; grid-row: 1 / 3; padding: 7px 7px 10px; margin: 0; } .qr-card > span { font-size: 8px; } .qr-card .qr-note { font-size: 7px; } .shared-count { grid-column: 1; margin: 0; font-size: 9px; } .live-footer { margin-top: 25px; font-size: 8px; } .live-controls { position: fixed; z-index: 5; bottom: 20px; } .empty-memory { min-height: 44svh; } }
        @media (prefers-reduced-motion: reduce) { .memory-frame, .slide-progress span { animation: none; } .live-controls { transition: none; } }
      `}</style>
    </main>
  );
}
