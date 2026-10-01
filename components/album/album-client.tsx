"use client";

import {
  Camera,
  CheckCircle2,
  Film,
  Heart,
  ImagePlus,
  Loader2,
  Sparkles,
  Users,
  X,
  ArrowRight,
  Settings2,
  RefreshCw,
  Flag,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { albumMediaUrl } from "@/lib/album/utils";
import type { AlbumGuest, AlbumSocial, AlbumMedia, AlbumMission, WeddingAlbum } from "@/lib/album/types";

import { queueList, queuePut, queueRemove, type QueuedPhoto } from "@/lib/album/queue";

type UploadItem = {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "preparing" | "uploading" | "done" | "error";
  error?: string;
};

type PreviewResult = {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number | null;
};

function uploadBlob(url: string, blob: Blob, contentType: string, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 180000;
    xhr.ontimeout = () => reject(new Error("La conexión está lenta. Podés reintentar la carga."));
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 respondió ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("No pudimos subir el archivo a R2."));
    xhr.send(blob);
  });
}

async function imagePreview(file: File): Promise<PreviewResult> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos generar la vista previa.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("No pudimos comprimir la foto.");

    return { blob, width: image.naturalWidth, height: image.naturalHeight, durationSeconds: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoPreview(file: File): Promise<PreviewResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No pudimos leer el video."));
    });

    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.min(1, Math.max(0, durationSeconds / 4));

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      window.setTimeout(resolve, 1200);
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const previewWidth = Math.max(1, Math.round(video.videoWidth * scale));
    const previewHeight = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos generar la portada del video.");
    context.drawImage(video, 0, 0, previewWidth, previewHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob) throw new Error("No pudimos generar la portada del video.");

    return {
      blob,
      width: video.videoWidth,
      height: video.videoHeight,
      durationSeconds,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function makePreview(file: File) {
  if (file.type.startsWith("video/")) return videoPreview(file);
  return imagePreview(file);
}

const primary =
  "flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-5 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-40";
const secondary =
  "flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-5 py-3 font-medium disabled:opacity-40";
const field =
  "mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--cream)] px-4 outline-none focus:border-[var(--moss)]";
const emptySocial: AlbumSocial = { me: null, guests: [], matches: [], likes: {}, uploads_used: 0, remaining: null };

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No pudimos completar la solicitud.");
  return body;
}

function WeddingSprig() {
  return (
    <svg viewBox="0 0 180 240" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <path d="M25 230C42 156 90 98 130 12M63 151C92 151 120 137 154 106" />
      <path d="M36 194C12 181 5 158 12 141C34 146 44 168 36 194ZM57 163C80 169 109 154 117 135C92 127 70 141 57 163ZM80 115C57 103 52 79 59 65C80 69 89 92 80 115ZM101 77C124 83 148 67 156 48C133 42 111 55 101 77ZM117 44C101 32 103 12 114 3C129 15 129 31 117 44ZM133 121C150 126 167 115 174 99C155 93 141 104 133 121Z" />
    </svg>
  );
}

export function AlbumClient({
  album: initialAlbum,
  missions,
  initialMedia,
}: {
  album: WeddingAlbum;
  missions: AlbumMission[];
  initialMedia: AlbumMedia[];
}) {
  const [album, setAlbum] = useState(initialAlbum);
  const [media, setMedia] = useState(initialMedia);
  const [social, setSocial] = useState<AlbumSocial>(emptySocial);
  const [loading, setLoading] = useState(true);
  const [guestName, setGuestName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [visible, setVisible] = useState(false);
  const [sparks, setSparks] = useState(false);
  const [adult, setAdult] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"camera" | "album" | "people">("camera");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selected, setSelected] = useState<AlbumMedia | null>(null);
  const [person, setPerson] = useState<AlbumGuest | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("recent");
  const [missionIndex, setMissionIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [blocked, setBlocked] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const pending = useRef<QueuedPhoto[]>([]);
  const joinRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = (await jsonRequest(`/api/album/social?albumId=${initialAlbum.id}`)) as AlbumSocial;
      setSocial(data);
      setBlocked(false);
      const feed = await jsonRequest(`/api/album/feed?albumId=${initialAlbum.id}`);
      setAlbum(feed.album);
      setMedia(feed.media);
      setError(null);
      return data;
    } catch (e) {
      const text = e instanceof Error ? e.message : "No pudimos actualizar el álbum.";
      if (text.includes("participación")) setBlocked(true);
      setError(text);
      return null;
    } finally {
      setLoading(false);
    }
  }, [initialAlbum.id]);

  useEffect(() => {
    Promise.resolve().then(refresh);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!loading && !social.me && window.matchMedia("(min-width: 761px)").matches)
      joinRef.current?.focus({ preventScroll: true });
  }, [loading, social.me]);
  function openProfile() {
    if (social.me) {
      setGuestName(social.me.display_name);
      setInstagram(social.me.instagram_handle || "");
      setVisible(social.me.social_enabled);
      setSparks(social.me.sparks_enabled);
      setAdult(!!social.me.is_adult);
    }
    setEditing(true);
  }

  function patchUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  async function uploadOne(item: QueuedPhoto) {
    let prepared: { mediaId: string; uploadToken: string; originalUploadUrl: string; previewUploadUrl: string } | null =
      null;
    try {
      if (!navigator.onLine) return false;
      patchUpload(item.id, { status: "preparing", progress: 3, error: undefined });
      const preview = await makePreview(item.file);
      if (preview.durationSeconds && preview.durationSeconds > album.max_video_seconds)
        throw new Error(`El video supera el máximo de ${album.max_video_seconds} segundos.`);
      const result = await jsonRequest("/api/album/prepare-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: album.id,
          filename: item.file.name,
          mimeType: item.file.type,
          fileSize: item.file.size,
          clientUploadId: item.id,
        }),
      });
      if (!result.alreadyUploaded) {
        prepared = result;
        patchUpload(item.id, { status: "uploading", progress: 8 });
        await uploadBlob(
          result.originalUploadUrl,
          item.file,
          item.file.type || "application/octet-stream",
          (progress) => patchUpload(item.id, { progress: 8 + Math.round(progress * 75) }),
        );
        await uploadBlob(result.previewUploadUrl, preview.blob, "image/webp", (progress) =>
          patchUpload(item.id, { progress: 83 + Math.round(progress * 12) }),
        );
        await jsonRequest("/api/album/complete-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            albumId: album.id,
            mediaId: result.mediaId,
            uploadToken: result.uploadToken,
            width: preview.width,
            height: preview.height,
            durationSeconds: preview.durationSeconds,
          }),
        });
      }
      await queueRemove(item.id).catch(() => {});
      pending.current = pending.current.filter((file) => file.id !== item.id);
      patchUpload(item.id, { status: "done", progress: 100 });
      setMessage(
        album.moderation_enabled
          ? "¡Gracias! Tu recuerdo quedó guardado y espera aprobación."
          : "¡Gracias! Tu recuerdo ya forma parte del álbum.",
      );
      await refresh();
      return true;
    } catch (e) {
      if (prepared)
        await fetch("/api/album/cancel-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId: album.id, ...prepared }),
        }).catch(() => {});
      patchUpload(item.id, {
        status: navigator.onLine ? "error" : "queued",
        error: e instanceof Error ? e.message : "La carga está pendiente. Podés reintentar.",
      });
      return false;
    }
  }
  const drain = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    drain.current = async () => {
      if (working.current || !social.me || blocked || !navigator.onLine) return;
      working.current = true;
      try {
        for (const item of [...pending.current]) if (!(await uploadOne(item))) break;
      } finally {
        working.current = false;
      }
    };
  });
  useEffect(() => {
    if (!social.me?.id) return;
    let cancelled = false;
    queueList(album.id, social.me.id)
      .then((items) => {
        if (cancelled) return;
        pending.current = items;
        setUploads(items.map((item) => ({ id: item.id, name: item.file.name, progress: 0, status: "queued" })));
        drain.current();
      })
      .catch(() => {});
    const online = () => drain.current();
    window.addEventListener("online", online);
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
    };
  }, [album.id, social.me?.id]);

  async function handleFiles(files: FileList) {
    if (!social.me || blocked || !album.uploads_enabled) return;
    setError(null);
    setMessage(null);
    const remaining = social.remaining === null ? 20 : Math.max(0, social.remaining - pending.current.length);
    const all = Array.from(files);
    const selectedFiles = all.slice(0, Math.min(20, remaining));
    if (selectedFiles.length < all.length)
      setMessage(`Podés agregar ${Math.min(20, remaining)} recuerdos en esta tanda.`);
    for (const file of selectedFiles) {
      const isVideo = file.type.startsWith("video/");
      if (isVideo && !album.allow_videos) {
        setError("Los videos están desactivados.");
        continue;
      }
      if (file.size > (isVideo ? album.max_video_mb : album.max_photo_mb) * 1024 * 1024) {
        setError(`${file.name} supera el tamaño permitido.`);
        continue;
      }
      const item: QueuedPhoto = {
        id: crypto.randomUUID(),
        albumId: album.id,
        guestId: social.me.id,
        file,
        createdAt: Date.now(),
      };
      try {
        await queuePut(item);
      } catch {
        setMessage(
          "El navegador no pudo guardar una copia pendiente. Mantené esta pantalla abierta hasta que termine la carga.",
        );
      }
      pending.current.push(item);
      setUploads((current) => [...current, { id: item.id, name: file.name, progress: 0, status: "queued" }]);
    }
    drain.current();
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await jsonRequest("/api/album/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: album.id,
          displayName: guestName,
          instagramHandle: instagram,
          socialEnabled: visible,
          sparksEnabled: sparks && visible,
          isAdult: adult,
        }),
      });
      if (photo) {
        const data = new FormData();
        data.append("albumId", album.id);
        data.append("photo", photo);
        await jsonRequest("/api/album/profile-photo", { method: "POST", body: data });
        setPhoto(null);
      }
      setEditing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu perfil.");
    } finally {
      setSaving(false);
    }
  }
  async function action(actionName: string, targetId: string, enabled?: boolean) {
    try {
      let reason: string | null = null;
      if (actionName.startsWith("report")) {
        reason = window.prompt("¿Por qué querés reportar este contenido? A&A revisará tu reporte.");
        if (!reason?.trim()) return;
      }
      await jsonRequest("/api/album/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: album.id, action: actionName, targetId, enabled, reason }),
      });
      if (actionName.startsWith("report")) setMessage("Gracias. A&A recibió tu reporte.");
      if (actionName === "spark")
        setMessage(enabled ? "Chispa enviada ✨ Solo verá tu elección si también te elige." : "Chispa retirada.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la acción.");
    }
  }
  const revealIn = album.gallery_reveal_at ? Math.max(0, Date.parse(album.gallery_reveal_at) - now) : 0;
  const galleryAvailable = album.gallery_enabled && revealIn === 0;
  const photos = useMemo(() => {
    const items = media.filter((item) => !filter || item.guest_id === filter);
    return sort === "liked"
      ? [...items].sort((a, b) => (social.likes[b.id]?.count || 0) - (social.likes[a.id]?.count || 0))
      : sort === "favorites"
        ? items.filter((item) => item.favorite)
        : items;
  }, [media, filter, sort, social.likes]);
  const busy = uploads.some((item) => item.status === "preparing" || item.status === "uploading");
  const queuedCount = uploads.filter((item) => item.status !== "done").length;
  const selectedPerson = person ? social.guests.find((g) => g.id === person.id) || person : null;
  const avatar = (guest: AlbumGuest, large = false) => (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-[var(--moss-soft)] font-serif text-[var(--moss)] ${large ? "h-32 w-32 text-6xl" : "h-20 w-20 text-4xl"}`}
    >
      {guest.has_photo ? (
        <img
          alt={guest.display_name}
          src={`/api/album/profile-photo?albumId=${album.id}&guestId=${guest.id}`}
          className="h-full w-full object-cover"
        />
      ) : (
        guest.display_name.charAt(0).toUpperCase()
      )}
    </div>
  );

  const joining = !social.me;
  const initials = album.title.split(/\s*[&+]\s*/).slice(0, 2).map((name) => name.trim().charAt(0)).join(" & ");
  const date = album.event_date ? new Date(`${album.event_date.slice(0, 10)}T12:00:00Z`) : null;
  const eventDate = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date).replaceAll("/", ".")
    : "Nuestro álbum";

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--cream)]">
        <Loader2 className="animate-spin text-[var(--moss)]" aria-label="Abriendo álbum" />
      </main>
    );
  if (blocked)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--cream)] p-6 text-center">
        <p>{error}</p>
      </main>
    );
  return (
    <main className={`guest-album min-h-screen pb-28 text-[var(--ink)] ${joining ? "joining" : "has-guest"}`}>
      <header className="album-header">
        <div className="header-sprig header-sprig-left"><WeddingSprig /></div>
        <div className="header-sprig header-sprig-right"><WeddingSprig /></div>
        <div className="album-header-inner">
          <div className="album-title">
            <p className="header-eyebrow">{eventDate} <span>·</span> Una noche para recordar</p>
            <h1>{album.title}</h1>
            {joining && <p className="header-caption">Nuestro álbum, desde tus ojos.</p>}
          </div>
          {social.me && (
            <button onClick={openProfile} className="profile-settings" aria-label="Editar mi perfil" title="Mi perfil">
              <Settings2 size={19} />
            </button>
          )}
        </div>
      </header>
      <div className="album-content mx-auto max-w-4xl space-y-6 px-4 py-6">
        {error ? (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-2xl bg-[var(--moss-soft)] p-4 text-sm text-[var(--moss-dark)]">
            {message}
          </p>
        ) : null}
        {!social.me || editing ? (
          <div className={joining ? "welcome-layout" : "profile-layout"}>
            {joining && (
              <aside className="welcome-story">
                <div className="wedding-seal" aria-hidden="true">{initials || "♡"}</div>
                <p className="album-eyebrow">Un pedacito de nuestra historia</p>
                <h2>Los recuerdos más lindos<br />también los hacés vos.</h2>
                <p className="story-description">{album.welcome_message}</p>
                <div className="welcome-steps">
                  <div><span><Camera size={19} strokeWidth={1.5} /></span><p><strong>Capturá el momento</strong><small>Una risa, un abrazo, un brindis.</small></p></div>
                  <div><span><ImagePlus size={19} strokeWidth={1.5} /></span><p><strong>Compartí tu mirada</strong><small>Subí tus fotos desde el celular.</small></p></div>
                  <div><span><Heart size={19} strokeWidth={1.5} /></span><p><strong>Revivamos esta noche</strong><small>Todos los recuerdos, en un mismo álbum.</small></p></div>
                </div>
                <p className="story-signature">Gracias por ser parte. <Heart size={12} aria-hidden="true" /></p>
              </aside>
            )}
          <section className="profile-card rounded-3xl border border-[var(--line)] bg-white p-6 sm:p-8">
            <div className="form-heading-icon" aria-hidden="true">{editing ? <Settings2 size={20} strokeWidth={1.5} /> : <Camera size={21} strokeWidth={1.5} />}</div>
            <p className="album-eyebrow">{editing ? "A tu manera" : "Bienvenido a nuestra fiesta"}</p>
            <h2 className="mt-3 font-serif text-4xl">{editing ? "Tu perfil" : "Entrá a nuestro álbum"}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{editing ? "Elegí cómo querés compartir esta noche con los demás." : "Dejanos tu nombre para saber de quién es cada recuerdo."}</p>
            <form onSubmit={saveProfile} className="mt-6 space-y-5">
              <label className="block text-sm font-semibold">
                ¿Cómo te llamás?
                <input
                  ref={joinRef}
                  required
                  maxLength={80}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="given-name"
                  className={field}
                />
              </label>
              {album.people_enabled ? (
                <label className="profile-choice flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => {
                      setVisible(e.target.checked);
                      if (!e.target.checked) setSparks(false);
                    }}
                    className="mt-1"
                  />
                  <span>
                    Mostrar mi perfil en <strong>Invitados</strong>
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                      Los demás podrán ver tu nombre y los recuerdos que compartís. Es opcional; podés cambiarlo cuando quieras.
                    </span>
                  </span>
                </label>
              ) : null}
              {visible && album.sparks_enabled ? (
                <div className="spark-choice space-y-3 rounded-2xl bg-[var(--cream)] p-4">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={sparks}
                      onChange={(e) => setSparks(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Quiero participar en <strong>Chispas ✨</strong>
                      <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                        Para conocer a alguien que te llamó la atención. Si ambos se mandan una Chispa, les avisamos. Opcional, solo para mayores de 18.
                      </span>
                    </span>
                  </label>
                  {sparks ? (
                    <>
                      <label className="flex items-start gap-3 text-xs">
                        <input
                          type="checkbox"
                          required
                          checked={adult}
                          onChange={(e) => setAdult(e.target.checked)}
                          className="mt-1"
                        />
                        <span>Confirmo que tengo 18 años o más.</span>
                      </label>
                      <label className="block text-sm">
                        Instagram (opcional)
                        <input
                          value={instagram}
                          onChange={(e) => setInstagram(e.target.value)}
                          placeholder="@tuusuario"
                          maxLength={31}
                          className={field}
                        />
                      </label>
                      <p className="text-xs leading-5 text-[var(--muted)]">
                        Tu Instagram solo se comparte cuando ambos se mandan una Chispa. No aparecerá en tu perfil
                        público.
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}
              {editing ? (
                <label className="block text-sm">
                  Foto de perfil (opcional)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                    className="mt-2 block w-full text-xs"
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">JPG, PNG o WebP · hasta 2 MB</span>
                </label>
              ) : null}
              <button type="submit" disabled={saving || !guestName.trim()} className={`${primary} w-full`}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {editing ? "Guardar perfil" : "Entrar al álbum"}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setPhoto(null);
                  }}
                  className={`${secondary} w-full`}
                >
                  Volver
                </button>
              ) : (
                <p className="text-center text-xs text-[var(--muted)]">
                  Sin cuenta ni contraseña. Tu ingreso queda guardado en este navegador.
                </p>
              )}
            </form>
          </section>
          </div>
        ) : (
          <>
            {tab === "camera" ? (
              <>
                <section className="upload-welcome rounded-3xl border border-[var(--line)] bg-white p-6 sm:p-8">
                  <p className="album-eyebrow">Tu mirada también cuenta</p>
                  <h2 className="mt-2 font-serif text-4xl">Hola, {social.me.display_name} ♡</h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    Hay momentos que solo vos podés capturar. Regalánoslos para guardarlos siempre.
                  </p>
                  <div className="capture-actions mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                      className={`${primary} min-h-32 flex-col text-lg`}
                      disabled={!album.uploads_enabled || social.remaining === 0 || busy}
                      onClick={() => cameraRef.current?.click()}
                    >
                      <Camera size={32} />
                      Sacar una foto
                    </button>
                    <button
                      className={`${secondary} min-h-32 flex-col text-lg`}
                      disabled={!album.uploads_enabled || social.remaining === 0 || busy}
                      onClick={() => inputRef.current?.click()}
                    >
                      <ImagePlus size={30} />
                      Elegir de mi galería
                    </button>
                  </div>
                  <p className="mt-5 text-center text-sm text-[var(--muted)]">
                    {!album.uploads_enabled
                      ? "Las cargas están pausadas."
                      : social.remaining === 0
                        ? "¡Completaste tu rollo! Gracias por guardar esta noche 🎞️"
                        : social.remaining === null
                          ? `${social.uploads_used} recuerdos compartidos · sin límite`
                          : `${social.uploads_used} de ${album.max_uploads_per_guest} recuerdos · te quedan ${social.remaining}`}
                  </p>
                  <p className="mt-2 text-center text-xs text-[var(--muted)]">
                    Guardamos tus originales, tal como los elegís.
                    {album.allow_videos ? " También podés subir videos." : ""}
                  </p>
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={album.allow_videos ? "image/*,video/*,.heic,.heif" : "image/*,.heic,.heif"}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </section>
                {uploads.length ? (
                  <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">
                        {queuedCount ? `${queuedCount} recuerdos pendientes` : "Recuerdos guardados"}
                      </h3>
                      {queuedCount ? (
                        <button
                          onClick={() => drain.current()}
                          disabled={busy}
                          className="flex items-center gap-1 text-sm text-[var(--moss)]"
                        >
                          <RefreshCw size={15} />
                          Reintentar
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      Las cargas pendientes se reintentan cuando vuelve la conexión con esta página abierta. También
                      podés volver desde este navegador.
                    </p>
                    <div className="mt-4 space-y-3">
                      {uploads.map((item) => (
                        <div key={item.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm">{item.name}</span>
                            {item.status === "done" ? (
                              <CheckCircle2 size={17} className="text-[var(--moss)]" />
                            ) : item.status === "uploading" || item.status === "preparing" ? (
                              <Loader2 size={17} className="animate-spin" />
                            ) : (
                              <button
                                className="text-xs text-[var(--muted)]"
                                onClick={async () => {
                                  await queueRemove(item.id).catch(() => {});
                                  pending.current = pending.current.filter((file) => file.id !== item.id);
                                  setUploads((current) => current.filter((file) => file.id !== item.id));
                                }}
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                          {item.error ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : null}
                          <div className="mt-2 h-1 rounded bg-[var(--cream)]">
                            <div className="h-1 rounded bg-[var(--moss)]" style={{ width: `${item.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {album.missions_enabled && missions.length ? (
                  <section className="rounded-3xl bg-[var(--moss)] p-6 text-white">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/65">
                      <Sparkles size={16} />
                      Misión del momento
                    </p>
                    <h3 className="mt-3 font-serif text-3xl">{missions[missionIndex % missions.length].title}</h3>
                    <p className="mt-2 text-sm text-white/70">{missions[missionIndex % missions.length].description}</p>
                    <button
                      onClick={() => setMissionIndex((i) => i + 1)}
                      className="mt-5 text-sm underline underline-offset-4"
                    >
                      Cambiar misión →
                    </button>
                  </section>
                ) : null}
                <div className="album-shortcuts grid grid-cols-2 gap-3">
                  <button onClick={() => setTab("album")} className={secondary}>
                    <Film size={18} />
                    Ver el álbum
                  </button>
                  {album.people_enabled ? (
                    <button onClick={() => setTab("people")} className={secondary}>
                      <Users size={18} />
                      Conocer invitados
                    </button>
                  ) : null}
                </div>
                {album.people_enabled && <p className="shortcut-help">En Invitados podés conocer otros perfiles y descubrir sus recuerdos.</p>}
              </>
            ) : null}
            {tab === "album" ? (
              <section>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--burgundy)]">
                      Álbum compartido
                    </p>
                    <h2 className="mt-2 font-serif text-4xl">Nuestra noche</h2>
                  </div>
                  <span className="text-xs text-[var(--muted)]">{galleryAvailable ? media.length : 0} recuerdos</span>
                </div>
                {!galleryAvailable ? (
                  <div className="mt-6 rounded-3xl bg-white p-8 text-center">
                    <Film className="mx-auto text-[var(--moss)]" size={32} />
                    <h3 className="mt-4 font-serif text-3xl">El álbum se está revelando</h3>
                    <p className="mt-3 text-sm text-[var(--muted)]">
                      {revealIn > 0
                        ? `Se revela el ${new Date(album.gallery_reveal_at!).toLocaleString("es-AR")}. Faltan ${Math.floor(revealIn / 3600000)} h ${Math.floor((revealIn % 3600000) / 60000)} min.`
                        : "A&A lo abrirá para compartir todos los recuerdos."}
                    </p>
                    <button onClick={() => setTab("camera")} className={`${primary} mx-auto mt-6`}>
                      Compartir otro recuerdo
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <select
                        aria-label="Ordenar recuerdos"
                        className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">Recientes</option>
                        {album.likes_enabled ? <option value="liked">Más queridas</option> : null}
                        <option value="favorites">Favoritas de A&A</option>
                      </select>
                      <select
                        aria-label="Filtrar por persona"
                        className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-3 text-sm"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="">Todos los invitados</option>
                        {social.guests.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.display_name}
                          </option>
                        ))}
                        <option value={social.me.id}>Mis recuerdos</option>
                      </select>
                    </div>
                    {photos.length ? (
                      <div className="mt-5 columns-2 gap-3 sm:columns-3">
                        {photos.map((item) => (
                          <div key={item.id} className="mb-3 break-inside-avoid overflow-hidden rounded-2xl bg-white">
                            <button onClick={() => setSelected(item)} className="relative block w-full">
                              <img
                                src={albumMediaUrl(item.id)}
                                alt={item.guest_name ? `Recuerdo de ${item.guest_name}` : "Recuerdo de la fiesta"}
                                loading="lazy"
                                className="w-full"
                              />
                              {item.media_type === "video" ? (
                                <Film size={20} className="absolute right-3 top-3 text-white drop-shadow" />
                              ) : null}
                            </button>
                            <div className="flex items-center justify-between gap-2 p-3">
                              <span className="truncate text-xs text-[var(--muted)]">
                                {album.show_guest_names ? item.guest_name : "A&A"}
                              </span>
                              {album.likes_enabled ? (
                                <button
                                  aria-label="Me gusta"
                                  aria-pressed={!!social.likes[item.id]?.liked}
                                  onClick={() => action("like", item.id, !social.likes[item.id]?.liked)}
                                  className="flex items-center gap-1 text-xs text-[var(--burgundy)]"
                                >
                                  <Heart size={16} fill={social.likes[item.id]?.liked ? "currentColor" : "none"} />
                                  {social.likes[item.id]?.count || 0}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-6 rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)]">
                        Todavía no hay recuerdos en esta selección. ¡Podés compartir el primero!
                      </p>
                    )}
                  </>
                )}
              </section>
            ) : null}
            {tab === "people" && album.people_enabled ? (
              <section className="guests-section">
                <p className="album-eyebrow">Compartimos mucho más que una fiesta</p>
                <h2 className="mt-2 font-serif text-4xl">Conocé a los invitados</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Poneles cara a los nombres y descubrí cómo están viviendo esta noche. Tocá un perfil para ver sus recuerdos.
                </p>
                <div className="guests-guide">
                  <div className="guest-guide-item"><Users size={21} strokeWidth={1.5} /><div><h3>Vos elegís si aparecés</h3><p>Solo mostramos a quienes activan su perfil en Invitados. Podés compartir fotos sin aparecer en esta sección.</p></div></div>
                  {album.sparks_enabled && <div className="guest-guide-item"><Sparkles size={21} strokeWidth={1.5} /><div><h3>¿Alguien te llamó la atención?</h3><p>Chispas es un juego opcional para mayores de 18. Mandale una desde su perfil; si también te elige, les avisamos a ambos. Tu Instagram se comparte solo si hay una elección mutua.</p></div></div>}
                </div>
                {!social.me.social_enabled ? (
                  <button onClick={openProfile} className={`${secondary} mt-5 w-full`}>
                    <Users size={17} /> Mostrar mi perfil en Invitados
                  </button>
                ) : !social.me.sparks_enabled && album.sparks_enabled ? (
                  <button onClick={openProfile} className={`${secondary} mt-5 w-full`}>
                    <Sparkles size={17} /> Configurar mi participación en Chispas
                  </button>
                ) : null}
                {social.matches.length ? (
                  <div className="mt-6 rounded-3xl bg-[var(--burgundy-soft)] p-5">
                    <h3 className="flex items-center gap-2 font-serif text-2xl text-[var(--burgundy)]">
                      <Sparkles size={20} />
                      ¡Hubo Chispa!
                    </h3>
                    <div className="mt-4 space-y-3">
                      {social.matches.map((g) => (
                        <div key={g.id} className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Vos y {g.display_name} se eligieron ♡</p>
                          {g.instagram_handle ? (
                            <a
                              href={`https://www.instagram.com/${encodeURIComponent(g.instagram_handle)}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-[var(--burgundy)] underline"
                            >
                              @{g.instagram_handle}
                            </a>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">Sin Instagram compartido</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="guests-count">{social.guests.length} {social.guests.length === 1 ? "perfil compartido" : "perfiles compartidos"}</p>
                {!social.guests.length && <div className="guests-empty"><Users size={30} strokeWidth={1} /><h3>Este espacio recién empieza</h3><p>Cuando otros invitados elijan mostrar su perfil, vas a poder conocerlos acá.</p></div>}
                <div className="guest-cards mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {social.guests.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setPerson(g)}
                      className="flex flex-col items-center rounded-3xl border border-[var(--line)] bg-white p-5 text-center"
                    >
                      {avatar(g)}
                      <span className="mt-3 text-sm font-semibold">
                        {g.display_name}
                        {g.id === social.me?.id ? " (vos)" : ""}
                      </span>
                      <span className="mt-1 text-xs text-[var(--muted)]">{g.photo_count} recuerdos</span>
                      {g.sparks_enabled ? (
                        <span className="mt-3 flex items-center gap-1 text-xs text-[var(--burgundy)]">
                          <Sparkles size={14} />
                          {g.sent_spark ? "Chispa enviada" : "Participa en Chispas"}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
      {social.me && !editing ? (
        <nav
          className="album-nav fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 px-3 pt-3 backdrop-blur"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-md justify-around">
            {(
              [
                { id: "camera", label: "Cámara", Icon: Camera },
                { id: "album", label: "Álbum", Icon: Film },
                ...(album.people_enabled ? [{ id: "people", label: "Invitados", Icon: Users }] : []),
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id as typeof tab)}
                aria-current={tab === id ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs ${tab === id ? "bg-[var(--moss-soft)] font-bold text-[var(--moss)]" : "text-[var(--muted)]"}`}
              >
                <Icon size={21} />
                {label}
                {id === "people" && social.matches.length ? (
                  <span className="text-[10px] text-[var(--burgundy)]">
                    {social.matches.length} Chispa{social.matches.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>
      ) : null}
      {selectedPerson ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedPerson.display_name}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => setPerson(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-[var(--cream)] p-7 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setPerson(null)} aria-label="Cerrar perfil" className="absolute right-4 top-4 p-2">
              <X size={20} />
            </button>
            <div className="mt-4 flex justify-center">{avatar(selectedPerson, true)}</div>
            <h3 className="mt-5 font-serif text-3xl">{selectedPerson.display_name}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">{selectedPerson.photo_count} recuerdos compartidos</p>
            {selectedPerson.id !== social.me?.id && selectedPerson.sparks_enabled && album.sparks_enabled ? (
              <button
                onClick={() =>
                  social.me?.sparks_enabled
                    ? action("spark", selectedPerson.id, !selectedPerson.sent_spark)
                    : (setPerson(null), openProfile())
                }
                className={`${primary} mt-6 w-full`}
              >
                <Sparkles size={18} />
                {selectedPerson.sent_spark ? "Retirar Chispa" : social.me?.sparks_enabled ? "Mandar una Chispa" : "Activar Chispas en mi perfil"}
              </button>
            ) : null}
            {selectedPerson.id !== social.me?.id && selectedPerson.sparks_enabled && album.sparks_enabled && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Una Chispa muestra tu interés. La otra persona solo se entera si también te elige.</p>}
            <button
              onClick={() => {
                setFilter(selectedPerson.id);
                setTab("album");
                setPerson(null);
              }}
              className={`${secondary} mt-3 w-full`}
            >
              Ver sus recuerdos
            </button>
            {selectedPerson.id !== social.me?.id ? (
              <button
                onClick={() => action("report-guest", selectedPerson.id)}
                className="mt-5 text-xs text-[var(--muted)]"
              >
                Reportar persona
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {selected ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recuerdo ampliado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setSelected(null)}
        >
          <button
            onClick={() => setSelected(null)}
            aria-label="Cerrar recuerdo"
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-3 text-white"
          >
            <X size={20} />
          </button>
          <div className="max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {selected.media_type === "video" ? (
              <video
                src={albumMediaUrl(selected.id, "original")}
                controls
                playsInline
                className="max-h-[75vh] max-w-full rounded-xl"
              />
            ) : (
              <img
                src={albumMediaUrl(selected.id, "original")}
                alt="Recuerdo original"
                className="max-h-[75vh] max-w-full rounded-xl object-contain"
              />
            )}
            <div className="mt-4 flex items-center justify-between gap-5 text-sm text-white/70">
              <span>{album.show_guest_names ? selected.guest_name : ""}</span>
              <a
                href={albumMediaUrl(selected.id, "original")}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Abrir original
              </a>
              <button onClick={() => action("report-media", selected.id)} aria-label="Reportar recuerdo">
                <Flag size={17} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .guest-album { background: radial-gradient(ellipse at 0 30%, #e6eadf70, transparent 55%), var(--cream); }
        .guest-album .album-header { position: relative; isolation: isolate; overflow: hidden; padding: 40px 24px 44px; background: radial-gradient(ellipse at 0 0, #59664a50, transparent 60%), radial-gradient(ellipse at 100% 100%, #682f3b35, transparent 55%), #1b211a; color: #f5efe3; }
        .guest-album .album-header::after { content: ''; position: absolute; inset: 12px; border: 1px solid #c5b38d30; pointer-events: none; z-index: -1; }
        .guest-album .header-sprig { position: absolute; width: 160px; color: #a9b492; opacity: .2; z-index: -1; pointer-events: none; }
        .guest-album .header-sprig-left { top: -75px; left: 8%; transform: rotate(35deg); }
        .guest-album .header-sprig-right { bottom: -100px; right: 8%; transform: rotate(215deg); }
        .guest-album .album-header-inner { max-width: 960px; margin: 0 auto; text-align: center; }
        .guest-album .header-eyebrow { font-size: 9px; line-height: 1.6; font-weight: 400; text-transform: uppercase; letter-spacing: .22em; color: #c5b38d; }
        .guest-album .header-eyebrow span { margin: 0 8px; }
        .guest-album .album-title h1 { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(33px, 4.7vw, 62px); font-weight: 400; letter-spacing: -.035em; line-height: 1.15; margin: 10px 0 8px; }
        .guest-album .header-caption { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 15px; color: #ded4c0b3; }
        .guest-album.has-guest .album-header { padding: 25px 24px; }
        .guest-album.has-guest .album-header-inner { display: flex; align-items: center; justify-content: space-between; gap: 20px; text-align: left; }
        .guest-album.has-guest .album-title h1 { font-size: clamp(27px, 3.5vw, 40px); margin: 7px 0 0; }
        .guest-album .profile-settings { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border: 1px solid #c5b38d55; border-radius: 50%; color: #e7dcc6; }
        .guest-album .profile-settings:hover { background: #c5b38d15; }
        .guest-album.joining .album-content { max-width: 1080px; padding-top: 40px; }
        .guest-album .welcome-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 480px); align-items: center; gap: clamp(35px, 6vw, 85px); }
        .guest-album .welcome-story { padding: 20px 10px 20px 24px; }
        .guest-album .wedding-seal { font-family: Georgia, 'Times New Roman', serif; font-style: italic; color: var(--moss); font-size: 24px; width: 76px; height: 76px; border: 1px solid #59664a65; outline: 1px solid #59664a25; outline-offset: 5px; border-radius: 50%; display: grid; place-items: center; margin: 0 0 30px 5px; }
        .guest-album .album-eyebrow { font-size: 9px; line-height: 1.6; letter-spacing: .2em; text-transform: uppercase; font-weight: 500; color: var(--burgundy); }
        .guest-album .welcome-story h2 { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(32px, 3.3vw, 43px); font-weight: 400; letter-spacing: -.035em; line-height: 1.15; margin: 12px 0 20px; }
        .guest-album .story-description { color: var(--muted); font-size: 14px; line-height: 1.9; max-width: 370px; }
        .guest-album .welcome-steps { display: grid; gap: 19px; margin-top: 30px; }
        .guest-album .welcome-steps > div { display: flex; align-items: center; gap: 13px; }
        .guest-album .welcome-steps > div > span { display: grid; place-items: center; width: 39px; height: 39px; flex-shrink: 0; border-radius: 50%; background: #59664a0c; border: 1px solid #59664a25; color: var(--moss); }
        .guest-album .welcome-steps strong { font-size: 12px; font-weight: 500; display: block; color: var(--ink); }
        .guest-album .welcome-steps small { display: block; margin-top: 3px; font-size: 11px; line-height: 1.5; color: var(--muted); }
        .guest-album .story-signature { display: flex; align-items: center; gap: 9px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--burgundy); margin-top: 34px; }
        .guest-album .profile-layout { max-width: 510px; margin: 0 auto; }
        .guest-album .profile-card { width: 100%; padding: 32px; position: relative; background: #fffdf9; border-radius: 8px 8px 28px 28px; border-color: #ded7ca; box-shadow: 0 15px 60px #36392d08; }
        .guest-album .profile-card::before { content: ''; position: absolute; top: 0; left: 28px; right: 28px; height: 3px; background: var(--moss); }
        .guest-album .form-heading-icon { display: grid; place-items: center; width: 43px; height: 43px; border-radius: 50%; color: var(--moss); background: var(--moss-soft); margin-bottom: 19px; }
        .guest-album .profile-card h2 { font-size: clamp(29px, 3vw, 36px); letter-spacing: -.035em; line-height: 1.15; margin-top: 10px; }
        .guest-album .profile-card form { margin-top: 25px; }
        .guest-album .profile-card input:not([type=checkbox]):not([type=file]) { background: #fff; border-radius: 12px; height: 50px; transition: border-color .2s, box-shadow .2s; }
        .guest-album .profile-card input:not([type=checkbox]):not([type=file]):focus { border-color: var(--moss); box-shadow: 0 0 0 3px #59664a12; }
        .guest-album .profile-card input[type=checkbox] { accent-color: var(--moss); width: 17px; height: 17px; flex-shrink: 0; }
        .guest-album .profile-choice { background: #f0f2eb; border: 1px solid #e2e6d8; padding: 15px; border-radius: 14px; cursor: pointer; }
        .guest-album .profile-choice > span { font-size: 13px; line-height: 1.6; }
        .guest-album .profile-choice strong { color: var(--moss-dark); }
        .guest-album .profile-choice > span > span { font-size: 12px; }
        .guest-album .spark-choice { border: 1px solid #eadde0; background: #faf4f5; }
        .guest-album .profile-card button[type=submit] { min-height: 52px; border-radius: 12px; font-size: 13px; box-shadow: 0 5px 15px #39433115; }
        .guest-album .profile-card form > p:last-child { font-size: 10px; line-height: 1.8; max-width: 290px; margin-left: auto; margin-right: auto; }
        .guest-album .upload-welcome { overflow: hidden; position: relative; border-radius: 22px; background: linear-gradient(130deg, #fffdf9 70%, #e6eadf60); }
        .guest-album .upload-welcome::before { content: ''; position: absolute; top: 0; left: 32px; width: 60px; height: 3px; background: var(--burgundy); }
        .guest-album .upload-welcome h2, .guest-album .guests-section h2 { letter-spacing: -.035em; line-height: 1.15; }
        .guest-album .capture-actions button { border-radius: 16px; font-size: 15px; gap: 13px; }
        .guest-album .capture-actions button:first-child { background: linear-gradient(135deg, #59664a, #394331); }
        .guest-album .album-shortcuts button { background: #fffdf9; font-size: 12px; border-radius: 14px; }
        .guest-album .shortcut-help { margin-top: 12px; text-align: center; color: var(--muted); font-size: 11px; line-height: 1.7; }
        .guest-album .guests-guide { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-top: 22px; background: #fffdf9; border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
        .guest-album .guest-guide-item { display: flex; gap: 12px; align-items: flex-start; }
        .guest-album .guest-guide-item > svg { flex-shrink: 0; color: var(--moss); margin-top: 2px; }
        .guest-album .guest-guide-item:last-child > svg { color: var(--burgundy); }
        .guest-album .guest-guide-item h3 { font-size: 13px; font-weight: 600; }
        .guest-album .guest-guide-item p { font-size: 12px; line-height: 1.8; color: var(--muted); margin-top: 6px; }
        .guest-album .guests-count { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: var(--moss); margin-top: 28px; }
        .guest-album .guest-cards { margin-top: 14px; }
        .guest-album .guest-cards > button { border-radius: 18px; background: #fffdf9; transition: box-shadow .2s, border-color .2s; }
        .guest-album .guest-cards > button:hover { border-color: #59664a70; box-shadow: 0 6px 20px #3943310a; }
        .guest-album .guest-cards > button > div { border-radius: 50%; }
        .guest-album .guests-empty { text-align: center; padding: 36px 24px; color: var(--moss); }
        .guest-album .guests-empty > svg { margin: 0 auto; }
        .guest-album .guests-empty h3 { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; margin-top: 16px; }
        .guest-album .guests-empty p { font-size: 12px; color: var(--muted); line-height: 1.8; max-width: 290px; margin: 10px auto 0; }
        .guest-album .album-nav { width: min(480px, calc(100% - 24px)); left: 50%; right: auto; bottom: 12px; transform: translateX(-50%); border: 1px solid var(--line); border-radius: 22px; padding-top: 10px; box-shadow: 0 8px 35px #17181415; }
        .guest-album .album-nav button { border-radius: 14px; font-size: 10px; }
        @media (max-width: 760px) { .guest-album .album-header { padding: 30px 20px; } .guest-album .header-eyebrow { font-size: 8px; letter-spacing: .13em; } .guest-album .album-title h1 { font-size: clamp(29px, 7vw, 44px); } .guest-album .header-caption { font-size: 13px; } .guest-album.joining .album-content { padding-top: 24px; max-width: 510px; } .guest-album .welcome-layout { grid-template-columns: minmax(0, 1fr); gap: 35px; } .guest-album .profile-card { order: 0; padding: 26px 24px; } .guest-album .welcome-story { order: 1; padding: 0 16px; } .guest-album .wedding-seal { width: 58px; height: 58px; font-size: 20px; margin-bottom: 26px; } .guest-album .welcome-story h2 { font-size: 34px; } .guest-album .story-description { font-size: 13px; } .guest-album.has-guest .album-header { padding: 22px 20px; } .guest-album.has-guest .header-eyebrow { font-size: 7px; } .guest-album.has-guest .album-title h1 { font-size: 27px; } .guest-album .guests-guide { grid-template-columns: minmax(0, 1fr); padding: 18px; gap: 18px; } .guest-album .album-shortcuts { grid-template-columns: minmax(0, 1fr); } }
        @media (prefers-reduced-motion: reduce) { .guest-album *, .guest-album *::before, .guest-album *::after { transition: none !important; } }
      `}</style>
    </main>
  );
}
