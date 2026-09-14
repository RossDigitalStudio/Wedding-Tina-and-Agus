"use client";

import { Camera, CheckCircle2, Film, Heart, ImagePlus, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { albumMediaUrl } from "@/lib/album/utils";
import type { AlbumMedia, AlbumMission, WeddingAlbum } from "@/lib/album/types";

type UploadItem = {
  id: string;
  name: string;
  progress: number;
  status: "preparing" | "uploading" | "done" | "error";
  error?: string;
};

type PreviewResult = {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number | null;
};

function makeSessionId() {
  const key = "aa-album-uploader-session";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

function uploadBlob(url: string, blob: Blob, contentType: string, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
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

export function AlbumClient({
  album,
  missions,
  initialMedia,
}: {
  album: WeddingAlbum;
  missions: AlbumMission[];
  initialMedia: AlbumMedia[];
}) {
  const [media, setMedia] = useState(initialMedia);
  const [guestName, setGuestName] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<AlbumMedia | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("aa-album-guest-name");
    if (saved) setGuestName(saved);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`public-album-${album.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "album_media", filter: `album_id=eq.${album.id}` },
        (payload) => {
          const next = payload.new as AlbumMedia;
          if (!next?.id) return;
          const visible = next.upload_state === "ready" && next.moderation_status === "approved" && next.show_in_gallery;
          setMedia((current) => {
            if (!visible) return current.filter((item) => item.id !== next.id);
            const without = current.filter((item) => item.id !== next.id);
            return [next, ...without];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [album.id]);

  const photos = useMemo(() => media.filter((item) => item.show_in_gallery), [media]);

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function uploadOne(file: File, uploadId: string) {
    try {
      updateUpload(uploadId, { status: "preparing", progress: 3 });
      const preview = await makePreview(file);

      if (file.type.startsWith("video/") && preview.durationSeconds && preview.durationSeconds > album.max_video_seconds) {
        throw new Error(`El video supera el máximo de ${album.max_video_seconds} segundos.`);
      }

      const sessionId = makeSessionId();
      const prepareResponse = await fetch("/api/album/prepare-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: album.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          guestName,
          uploaderSessionId: sessionId,
        }),
      });

      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(prepared.error || "No pudimos preparar la carga.");

      updateUpload(uploadId, { status: "uploading", progress: 8 });
      await uploadBlob(prepared.originalUploadUrl, file, file.type || "application/octet-stream", (progress) => {
        updateUpload(uploadId, { progress: 8 + Math.round(progress * 75) });
      });

      await uploadBlob(prepared.previewUploadUrl, preview.blob, "image/webp", (progress) => {
        updateUpload(uploadId, { progress: 83 + Math.round(progress * 12) });
      });

      const completeResponse = await fetch("/api/album/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: prepared.mediaId,
          uploadToken: prepared.uploadToken,
          width: preview.width,
          height: preview.height,
          durationSeconds: preview.durationSeconds,
        }),
      });

      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error || "No pudimos completar la carga.");

      updateUpload(uploadId, { status: "done", progress: 100 });
      if (completed.media?.moderation_status === "approved") {
        setMedia((current) => [completed.media as AlbumMedia, ...current.filter((item) => item.id !== completed.media.id)]);
      }
      setMessage(
        completed.media?.moderation_status === "pending"
          ? "¡Gracias! La foto quedó guardada y está esperando aprobación para aparecer en la galería."
          : "¡Gracias! Tu recuerdo ya forma parte del álbum.",
      );
    } catch (error) {
      updateUpload(uploadId, {
        status: "error",
        error: error instanceof Error ? error.message : "No pudimos subir este archivo.",
      });
    }
  }

  async function handleFiles(fileList: FileList | File[]) {
    if (!album.uploads_enabled) return;
    const selectedFiles = Array.from(fileList).slice(0, 20);
    if (!selectedFiles.length) return;

    localStorage.setItem("aa-album-guest-name", guestName.trim());
    setMessage(null);

    const batch = selectedFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
      status: "preparing" as const,
      file,
    }));

    setUploads((current) => [
      ...batch.map(({ file: _file, ...item }) => item),
      ...current.filter((item) => item.status !== "done"),
    ]);

    for (const item of batch) {
      await uploadOne(item.file, item.id);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <section className="relative overflow-hidden bg-[var(--ink)] px-5 py-14 text-white sm:py-20">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--moss)]/30 blur-3xl" />
        <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[var(--burgundy)]/30 blur-3xl" />
        <div className="relative mx-auto max-w-5xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10">
            <Camera size={24} />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-white/50">23 · 10 · 2027</p>
          <h1 className="mt-3 font-serif text-5xl leading-none sm:text-7xl">{album.title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/65">{album.welcome_message}</p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!album.uploads_enabled}
            className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-white px-6 font-semibold text-[var(--ink)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus size={20} />
            {album.uploads_enabled ? "Subir fotos y videos" : "Las cargas están pausadas"}
          </button>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--moss-soft)] text-[var(--moss)]">
                <Upload size={20} />
              </div>
              <div>
                <h2 className="font-serif text-3xl">Compartí lo que estás viendo</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">No hace falta registrarse. Elegí varias fotos juntas y nosotros guardamos los originales.</p>
              </div>
            </div>

            <label className="mt-6 grid gap-1.5 text-sm font-medium">
              Tu nombre <span className="font-normal text-[var(--muted)]">(opcional)</span>
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value.slice(0, 80))}
                placeholder="Ej. Juli"
                className="h-11 rounded-xl border border-[var(--line)] bg-[var(--cream)] px-3 outline-none focus:border-[var(--moss)]"
              />
            </label>

            <button
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFiles(event.dataTransfer.files);
              }}
              className={`mt-5 flex min-h-48 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition ${
                dragging ? "border-[var(--moss)] bg-[var(--moss-soft)]" : "border-[var(--line)] bg-[var(--cream)] hover:border-[var(--moss)]"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                <ImagePlus size={22} className="text-[var(--moss)]" />
              </div>
              <span className="mt-3 font-semibold">Elegí fotos o videos</span>
              <span className="mt-1 text-xs text-[var(--muted)]">Hasta 20 archivos por tanda · fotos {album.max_photo_mb} MB · videos {album.max_video_mb} MB</span>
            </button>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept={album.allow_videos ? "image/*,video/*,.heic,.heif" : "image/*,.heic,.heif"}
              className="hidden"
              onChange={(event) => {
                if (event.target.files) handleFiles(event.target.files);
                event.target.value = "";
              }}
            />

            {uploads.length ? (
              <div className="mt-5 space-y-2">
                {uploads.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{item.name}</span>
                      {item.status === "done" ? <CheckCircle2 size={17} className="shrink-0 text-[var(--moss)]" /> : item.status === "error" ? <X size={17} className="shrink-0 text-red-600" /> : <Loader2 size={17} className="shrink-0 animate-spin text-[var(--moss)]" />}
                    </div>
                    {item.status === "error" ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--cream-2)]">
                        <div className="h-full rounded-full bg-[var(--moss)] transition-all" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {message ? <div className="mt-5 rounded-2xl bg-[var(--moss-soft)] p-4 text-sm text-[var(--moss-dark)]">{message}</div> : null}
          </div>

          <div className="rounded-[2rem] bg-[var(--moss)] p-5 text-white sm:p-7">
            <div className="flex items-center gap-2 text-white/70"><Sparkles size={17} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Misiones de fotos</span></div>
            <h2 className="mt-3 font-serif text-3xl">¿Necesitás inspiración?</h2>
            <div className="mt-6 space-y-3">
              {album.missions_enabled && missions.length ? missions.map((mission, index) => (
                <div key={mission.id} className="rounded-2xl border border-white/12 bg-white/8 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[var(--moss)]">{index + 1}</span>
                    <div><p className="font-semibold">{mission.title}</p>{mission.description ? <p className="mt-1 text-xs leading-5 text-white/60">{mission.description}</p> : null}</div>
                  </div>
                </div>
              )) : <p className="text-sm text-white/60">Hoy la misión es simple: disfrutá y sacá muchas fotos.</p>}
            </div>
          </div>
        </section>

        {album.gallery_enabled ? (
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--burgundy)]">Álbum compartido</p>
                <h2 className="mt-1 font-serif text-4xl">La noche, vista por todos</h2>
              </div>
              <div className="text-sm text-[var(--muted)]">{photos.length} recuerdos</div>
            </div>

            {photos.length ? (
              <div className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4">
                {photos.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item)} className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-[var(--cream-2)] text-left">
                    <img src={albumMediaUrl(item.id)} alt={item.guest_name ? `Foto de ${item.guest_name}` : "Foto del álbum"} className="w-full transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/65 to-transparent p-3 pt-10 text-white">
                      <span className="truncate text-xs">{album.show_guest_names ? item.guest_name || "Invitado" : ""}</span>
                      <span className="flex items-center gap-1 text-[10px]">{item.media_type === "video" ? <Film size={13} /> : item.favorite ? <Heart size={13} fill="currentColor" /> : null}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[2rem] border border-dashed border-[var(--line)] bg-white p-12 text-center">
                <Camera size={30} className="mx-auto text-[var(--moss)]" />
                <h3 className="mt-4 font-serif text-2xl">Todavía está vacío</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">Podés ser la primera persona en subir un recuerdo.</p>
              </div>
            )}
          </section>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setSelected(null)}>
          <button onClick={() => setSelected(null)} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"><X size={20} /></button>
          <div className="max-h-[92vh] max-w-6xl" onClick={(event) => event.stopPropagation()}>
            {selected.media_type === "video" ? (
              <video src={albumMediaUrl(selected.id, "original")} controls autoPlay playsInline className="max-h-[88vh] max-w-full rounded-xl" />
            ) : (
              <img src={albumMediaUrl(selected.id, "original")} alt="Recuerdo ampliado" className="max-h-[88vh] max-w-full rounded-xl object-contain" />
            )}
            {album.show_guest_names && selected.guest_name ? <p className="mt-3 text-center text-sm text-white/65">Compartida por {selected.guest_name}</p> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
