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
    if (!loading && !social.me) joinRef.current?.focus();
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
    <main className="min-h-screen bg-[var(--cream)] pb-28 text-[var(--ink)]">
      <header className="bg-[var(--ink)] px-5 pb-8 pt-8 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-white/50">
              {album.event_date
                ? new Date(`${album.event_date}T12:00:00`).toLocaleDateString("es-AR")
                : "Nuestro álbum"}
            </p>
            <h1 className="mt-2 font-serif text-3xl">{album.title}</h1>
          </div>
          {social.me ? (
            <button
              onClick={openProfile}
              className="rounded-full border border-white/20 p-3"
              aria-label="Editar mi perfil"
            >
              <Settings2 size={19} />
            </button>
          ) : (
            <Camera size={24} />
          )}
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
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
          <section className="mx-auto max-w-md rounded-3xl border border-[var(--line)] bg-white p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--burgundy)]">Desde tus ojos</p>
            <h2 className="mt-3 font-serif text-4xl">{editing ? "Tu perfil" : "Bienvenido a la fiesta ♡"}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{album.welcome_message}</p>
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
                <label className="flex items-start gap-3 text-sm">
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
                    Quiero aparecer en <strong>Quién está</strong>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      Opcional. Podés cambiarlo cuando quieras.
                    </span>
                  </span>
                </label>
              ) : null}
              {visible && album.sparks_enabled ? (
                <div className="space-y-3 rounded-2xl bg-[var(--cream)] p-4">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={sparks}
                      onChange={(e) => setSparks(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Quiero participar en <strong>Chispas ✨</strong>
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
        ) : (
          <>
            {tab === "camera" ? (
              <>
                <section className="rounded-3xl border border-[var(--line)] bg-white p-6 sm:p-8">
                  <p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--moss)]">Ya estás dentro</p>
                  <h2 className="mt-2 font-serif text-4xl">Hola, {social.me.display_name} ♡</h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    Guardemos esta noche desde todos los puntos de vista.
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setTab("album")} className={secondary}>
                    Ver el álbum
                  </button>
                  {album.people_enabled ? (
                    <button onClick={() => setTab("people")} className={secondary}>
                      <Users size={18} />
                      {social.guests.length} personas
                    </button>
                  ) : null}
                </div>
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
              <section>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--moss)]">Compartiendo esta noche</p>
                <h2 className="mt-2 font-serif text-4xl">Quién está</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {social.guests.length} personas se sumaron a esta parte del álbum.
                  {album.sparks_enabled ? " Mandá una Chispa; si se eligen mutuamente, se enterarán acá." : ""}
                </p>
                {!social.me.social_enabled ? (
                  <button onClick={openProfile} className={`${secondary} mt-5 w-full`}>
                    Quiero aparecer acá
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
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 px-3 pt-3 backdrop-blur"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-md justify-around">
            {(
              [
                { id: "camera", label: "Cámara", Icon: Camera },
                { id: "album", label: "Álbum", Icon: Film },
                ...(album.people_enabled ? [{ id: "people", label: "Quién está", Icon: Users }] : []),
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id as typeof tab)}
                className={`flex min-w-24 flex-col items-center gap-1 rounded-2xl px-4 py-2 text-xs ${tab === id ? "bg-[var(--moss-soft)] font-bold text-[var(--moss)]" : "text-[var(--muted)]"}`}
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
                {selectedPerson.sent_spark ? "Retirar Chispa" : "Mandar una Chispa"}
              </button>
            ) : null}
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
    </main>
  );
}
