"use client";

import {
  Check,
  Download,
  Users,
  Copy,
  Eye,
  EyeOff,
  Film,
  Heart,
  Image as ImageIcon,
  Loader2,
  MonitorPlay,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useWedding } from "@/components/planner/wedding-context";
import { createClient } from "@/lib/supabase/client";
import { albumMediaUrl, formatBytes, quickChartQrUrl } from "@/lib/album/utils";
import type { AlbumMedia, AlbumMission, WeddingAlbum } from "@/lib/album/types";

type SettingsDraft = {
  welcome_message: string;
  uploads_enabled: boolean;
  gallery_enabled: boolean;
  live_enabled: boolean;
  moderation_enabled: boolean;
  allow_videos: boolean;
  missions_enabled: boolean;
  show_guest_names: boolean;
  live_interval_seconds: number;
  max_photo_mb: number;
  max_video_mb: number;
  max_video_seconds: number;
  max_uploads_per_guest: number;
  people_enabled: boolean;
  sparks_enabled: boolean;
  instagram_on_match: boolean;
  likes_enabled: boolean;
  gallery_reveal_at: string | null;
};

export default function AlbumAdminPage() {
  const { wedding } = useWedding();
  const [album, setAlbum] = useState<WeddingAlbum | null>(null);
  const [media, setMedia] = useState<AlbumMedia[]>([]);
  const [missions, setMissions] = useState<AlbumMission[]>([]);
  const [guests, setGuests] = useState<
    { id: string; display_name: string; social_enabled: boolean; sparks_enabled: boolean; blocked: boolean }[]
  >([]);
  const [reports, setReports] = useState<
    { id: string; media_id: string | null; reported_guest_id: string | null; reason: string; resolved: boolean }[]
  >([]);
  const [socialStats, setSocialStats] = useState({ sparks: 0, matches: 0 });
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newMission, setNewMission] = useState("");
  const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "");
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [tab, setTab] = useState("media");
  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [guestSearch, setGuestSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadNotice, setDownloadNotice] = useState<{ title: string; description: string } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const supabase = createClient();
      const { data: albumData, error: albumError } = await supabase
        .from("wedding_albums")
        .select("*")
        .eq("wedding_id", wedding.id)
        .maybeSingle();

      if (albumError) throw albumError;
      if (!albumData) {
        setAlbum(null);
        setMedia([]);
        setMissions([]);
        setLoading(false);
        return;
      }

      const [mediaResult, missionResult, guestResult, reportResult] = await Promise.all([
        supabase.from("album_media").select("*").eq("album_id", albumData.id).order("created_at", { ascending: false }),
        supabase.from("album_missions").select("*").eq("album_id", albumData.id).order("sort_order"),
        supabase
          .from("album_guests")
          .select("id, display_name, social_enabled, sparks_enabled, blocked")
          .eq("album_id", albumData.id)
          .order("joined_at"),
        supabase
          .from("album_reports")
          .select("id, media_id, reported_guest_id, reason, resolved")
          .eq("album_id", albumData.id)
          .eq("resolved", false)
          .order("created_at", { ascending: false }),
      ]);

      const compatibilityMissing =
        ["42P01", "42703"].includes(guestResult.error?.code || "") || albumData.max_uploads_per_guest === undefined;
      if (
        mediaResult.error ||
        missionResult.error ||
        (guestResult.error && !compatibilityMissing) ||
        (reportResult.error && !compatibilityMissing)
      )
        throw new Error("No pudimos cargar los recuerdos y la actividad del álbum.");
      setGuests(guestResult.data || []);
      setReports(reportResult.data || []);
      setMigrationMissing(compatibilityMissing);
      if (!guestResult.error) {
        const response = await fetch(`/api/album/admin-stats?albumId=${albumData.id}`).catch(() => null);
        if (response?.ok) setSocialStats(await response.json());
      }
      setAlbum(albumData as WeddingAlbum);
      setMedia((mediaResult.data || []) as AlbumMedia[]);
      setMissions((missionResult.data || []) as AlbumMission[]);
      setDraft(
        (current) =>
          current ?? {
            welcome_message: albumData.welcome_message,
            uploads_enabled: albumData.uploads_enabled,
            gallery_enabled: albumData.gallery_enabled,
            live_enabled: albumData.live_enabled,
            moderation_enabled: albumData.moderation_enabled,
            allow_videos: albumData.allow_videos,
            missions_enabled: albumData.missions_enabled,
            show_guest_names: albumData.show_guest_names,
            live_interval_seconds: albumData.live_interval_seconds,
            max_photo_mb: albumData.max_photo_mb,
            max_video_mb: albumData.max_video_mb,
            max_video_seconds: albumData.max_video_seconds,
            max_uploads_per_guest: albumData.max_uploads_per_guest ?? 10,
            people_enabled: albumData.people_enabled ?? true,
            sparks_enabled: albumData.sparks_enabled ?? true,
            instagram_on_match: albumData.instagram_on_match ?? true,
            likes_enabled: albumData.likes_enabled ?? true,
            gallery_reveal_at: albumData.gallery_reveal_at || null,
          },
      );
    } catch {
      setError("No pudimos cargar el álbum. Revisá la conexión y reintentá.");
    } finally {
      setLoading(false);
    }
  }, [wedding.id]);

  useEffect(() => {
    if (!baseUrl) {
      const timer = window.setTimeout(() => setBaseUrl(window.location.origin), 0);
      return () => window.clearTimeout(timer);
    }
  }, [baseUrl]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const publicUrl = `${baseUrl || ""}/album/${encodeURIComponent(album?.slug || "")}`;
  const liveUrl = `${publicUrl}/live`;
  const qrUrl = baseUrl ? quickChartQrUrl(publicUrl, 360) : "";

  const stats = useMemo(() => {
    const ready = media.filter((item) => item.upload_state === "ready");
    const participants = new Set(ready.map((item) => item.uploader_session_id).filter(Boolean)).size;
    const bytes = ready.reduce((sum, item) => sum + Number(item.file_size_bytes || 0), 0);
    const pending = ready.filter((item) => item.moderation_status === "pending").length;
    return {
      ready: ready.length,
      participants: guests.length || participants,
      bytes,
      favorites: ready.filter((item) => item.favorite).length,
      pending,
    };
  }, [media, guests]);

  function handleDownload(event: MouseEvent<HTMLAnchorElement>, favorites = false) {
    if ((favorites ? stats.favorites : stats.ready) > 0) {
      setDownloadNotice(null);
      return;
    }
    event.preventDefault();
    setDownloadNotice(
      favorites
        ? {
            title: "Todavía no tenés favoritas",
            description: "Marcá el corazón en las fotos o videos que quieras guardar y después descargalos desde acá.",
          }
        : {
            title: "Todavía no hay recuerdos para descargar",
            description: "Cuando se termine de subir la primera foto o video, vas a poder descargar el álbum.",
          },
    );
  }

  function editDraft(next: SettingsDraft) {
    setDraft(next);
    setNotice("");
    setError("");
  }

  const dirty =
    !!draft &&
    !!album &&
    Object.entries(draft).some(
      ([key, value]) =>
        !(
          migrationMissing &&
          [
            "max_uploads_per_guest",
            "people_enabled",
            "sparks_enabled",
            "instagram_on_match",
            "likes_enabled",
            "gallery_reveal_at",
          ].includes(key)
        ) && value !== album[key as keyof WeddingAlbum],
    );
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const visibleMedia = media.filter(
    (item) =>
      (mediaFilter === "all" ||
        (mediaFilter === "favorites"
          ? item.favorite
          : mediaFilter === "photo" || mediaFilter === "video"
            ? item.media_type === mediaFilter
            : mediaFilter === "uploading" || mediaFilter === "failed"
              ? item.upload_state === mediaFilter
              : item.upload_state === "ready" && item.moderation_status === mediaFilter)) &&
      normalize(`${item.guest_name || ""} ${item.original_filename}`).includes(normalize(search)),
  );
  const visibleGuests = guests.filter((guest) => normalize(guest.display_name).includes(normalize(guestSearch)));

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!album || !draft || saving || busyId) return;
    setError("");
    setNotice("");
    const ranges: [keyof SettingsDraft, number, number, string][] = [
      ["live_interval_seconds", 3, 60, "El intervalo de pantalla"],
      ["max_photo_mb", 1, 100, "El tamaño de foto"],
      ["max_video_mb", 10, 1000, "El tamaño de video"],
      ["max_video_seconds", 5, 600, "La duración de video"],
      ["max_uploads_per_guest", 0, 1000, "El cupo por invitado"],
    ];
    for (const [key, min, max, label] of ranges) {
      const value = Number(draft[key]);
      if (!Number.isInteger(value) || value < min || value > max) {
        setError(`${label} debe ser un entero entre ${min} y ${max}.`);
        return;
      }
    }
    setSaving(true);
    try {
      const patch = migrationMissing
        ? Object.fromEntries(
            Object.entries(draft).filter(
              ([key]) =>
                ![
                  "max_uploads_per_guest",
                  "people_enabled",
                  "sparks_enabled",
                  "instagram_on_match",
                  "likes_enabled",
                  "gallery_reveal_at",
                ].includes(key),
            ),
          )
        : draft;
      const { error } = await createClient()
        .from("wedding_albums")
        .update(patch)
        .eq("id", album.id)
        .eq("wedding_id", wedding.id)
        .select("id")
        .single();
      if (error) throw error;
      setAlbum((current) => (current ? { ...current, ...patch } : current));
      setNotice("Configuración del álbum guardada.");
    } catch {
      setError("No pudimos guardar los ajustes. Tus cambios siguen acá para reintentar.");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(key: string, action: () => Promise<void>) {
    if (busyId || saving) return;
    setBusyId(key);
    setError("");
    setNotice("");
    try {
      await action();
    } catch {
      setError("No pudimos completar la acción. Reintentá en unos segundos.");
    } finally {
      setBusyId(null);
    }
  }
  async function patchMedia(id: string, patch: Partial<AlbumMedia>) {
    if (!album) return;
    await mutate(id, async () => {
      const { error } = await createClient()
        .from("album_media")
        .update(patch)
        .eq("id", id)
        .eq("album_id", album.id)
        .select("id")
        .single();
      if (error) throw error;
      setMedia((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    });
  }
  async function removeMedia(item: AlbumMedia) {
    if (
      busyId ||
      saving ||
      !confirm(`¿Eliminar definitivamente “${item.original_filename}”? El archivo original también se eliminará.`)
    )
      return;
    await mutate(item.id, async () => {
      const response = await fetch(`/api/album/media/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No pudimos eliminar el archivo.");
      setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id));
      setNotice("Recuerdo eliminado.");
    });
  }
  async function addMission(event: React.FormEvent) {
    event.preventDefault();
    if (!album || !newMission.trim()) return;
    await mutate("new-mission", async () => {
      const { data, error } = await createClient()
        .from("album_missions")
        .insert({
          album_id: album.id,
          wedding_id: wedding.id,
          title: newMission.trim(),
          active: true,
          sort_order: Math.max(0, ...missions.map((m) => m.sort_order)) + 10,
        })
        .select("*")
        .single();
      if (error) throw error;
      setMissions((current) => [...current, data as AlbumMission]);
      setNewMission("");
      setNotice("Misión agregada.");
    });
  }
  async function toggleMission(mission: AlbumMission) {
    if (!album) return;
    await mutate(mission.id, async () => {
      const { error } = await createClient()
        .from("album_missions")
        .update({ active: !mission.active })
        .eq("id", mission.id)
        .eq("album_id", album.id)
        .select("id")
        .single();
      if (error) throw error;
      setMissions((current) =>
        current.map((item) => (item.id === mission.id ? { ...item, active: !item.active } : item)),
      );
    });
  }
  async function deleteMission(mission: AlbumMission) {
    if (!album || busyId || saving || !confirm(`¿Eliminar la misión “${mission.title}”?`)) return;
    await mutate(mission.id, async () => {
      const { error } = await createClient()
        .from("album_missions")
        .delete()
        .eq("id", mission.id)
        .eq("album_id", album.id)
        .select("id")
        .single();
      if (error) throw error;
      setMissions((current) => current.filter((item) => item.id !== mission.id));
    });
  }
  async function blockGuest(guest: (typeof guests)[number]) {
    if (
      !album ||
      busyId ||
      saving ||
      !confirm(`¿${guest.blocked ? "Desbloquear" : "Bloquear"} a ${guest.display_name}?`)
    )
      return;
    await mutate(guest.id, async () => {
      const { error } = await createClient()
        .from("album_guests")
        .update({ blocked: !guest.blocked })
        .eq("id", guest.id)
        .eq("album_id", album.id)
        .select("id")
        .single();
      if (error) throw error;
      setGuests((current) =>
        current.map((item) => (item.id === guest.id ? { ...item, blocked: !item.blocked } : item)),
      );
    });
  }
  async function resolveReport(id: string) {
    if (!album) return;
    await mutate(id, async () => {
      const { error } = await createClient()
        .from("album_reports")
        .update({ resolved: true })
        .eq("id", id)
        .eq("album_id", album.id)
        .select("id")
        .single();
      if (error) throw error;
      setReports((current) => current.filter((report) => report.id !== id));
    });
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("No pudimos copiar el enlace. Podés seleccionarlo y copiarlo manualmente.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <Loader2 className="animate-spin text-[var(--moss)]" />
      </div>
    );
  }

  if (!album || !draft) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Álbum digital"
          title="Álbum"
          description="No pudimos mostrar el álbum de este casamiento."
        />
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">Todavía no hay un álbum disponible.</p>
        )}
        <Button variant="secondary" disabled={!!busyId || saving} onClick={load}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Los recuerdos de nuestra celebración"
        title="Álbum digital"
        description="Administrá todo lo que los invitados compartan durante la fiesta, sin que necesiten registrarse."
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--cream-2)]"
            >
              <Eye size={16} /> Ver álbum
            </a>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white hover:opacity-90"
            >
              <MonitorPlay size={16} /> Pantalla en vivo
            </a>
          </div>
        }
      />

      {error ? (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">
          {error}{" "}
          <Button variant="secondary" size="sm" className="ml-2" disabled={!!busyId || saving} onClick={load}>
            Actualizar datos
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-[var(--moss-soft)] p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { key: "media", label: "Recuerdos" },
          { key: "settings", label: "Accesos y ajustes" },
          { key: "people", label: "Participantes" },
          { key: "missions", label: "Misiones" },
        ].map((item) => (
          <Button
            key={item.key}
            variant={tab === item.key ? "primary" : "secondary"}
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.key === "settings" && dirty ? " ·" : ""}
          </Button>
        ))}
      </div>
      {migrationMissing ? (
        <Card className="border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold">Algunas funciones todavía no están disponibles</p>
          <p className="mt-2 text-sm">
            La sección de participantes y las opciones sociales requieren completar la configuración del álbum.
          </p>
        </Card>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          ["Recuerdos", stats.ready, ImageIcon],
          ["Participantes", stats.participants, Users],
          ["Favoritas", stats.favorites, Heart],
          ["Pendientes", stats.pending, ShieldCheck],
          ["Almacenado", formatBytes(stats.bytes), Film],
        ].map(([label, value, Icon]) => {
          const IconComponent = Icon as typeof ImageIcon;
          return (
            <Card
              key={String(label)}
              className={`min-w-0 p-4 ${label === "Almacenado" ? "col-span-2 sm:col-span-1" : ""}`}
            >
              <IconComponent size={18} className="text-[var(--moss)]" />
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                {String(label)}
              </p>
              <p className="mt-1 text-2xl font-semibold">{String(value)}</p>
            </Card>
          );
        })}
      </div>

      {tab === "settings" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <Card className="overflow-hidden">
            <div className="bg-[var(--ink)] p-6 text-white">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                <QrCode size={15} /> QR de invitados
              </div>
              <h2 className="mt-2 font-serif text-3xl">Compartí el álbum</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Este QR siempre lleva a la pantalla pública de carga y galería.
              </p>
            </div>
            <div className="p-6">
              {qrUrl ? (
                <img
                  src={qrUrl}
                  alt="QR del álbum"
                  width={360}
                  height={360}
                  className="mx-auto aspect-square h-auto w-full max-w-64 rounded-2xl border border-[var(--line)] bg-white p-2"
                />
              ) : null}
              <div className="mt-4 rounded-xl bg-[var(--cream)] p-3 text-xs break-all">{publicUrl}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={copyLink}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--moss)] px-4 text-sm font-medium text-white hover:brightness-95"
                >
                  <QrCode size={16} /> Abrir QR
                </a>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
                Antes de imprimir el QR, escanealo desde otro celular para comprobar que abre el álbum.
              </p>
            </div>
          </Card>

          <Card className="min-w-0 p-5 sm:p-6">
            <form onSubmit={saveSettings}>
              <fieldset disabled={saving} className="min-w-0 [&_input]:min-w-0 [&_textarea]:w-full [&_label]:min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--moss)]">Control general</p>
                    <h2 className="mt-1 font-serif text-3xl">Configuración del álbum</h2>
                  </div>
                  <Button type="submit" disabled={saving || !!busyId || !dirty}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
                  </Button>
                </div>

                <p className="mt-3 text-xs text-[var(--muted)]">
                  {dirty
                    ? "Tenés ajustes sin guardar. Podés cambiar de sección sin perderlos."
                    : "Los ajustes están guardados."}
                </p>
                <div className="mt-6 grid min-w-0 gap-4">
                  <Field label="Mensaje de bienvenida">
                    <Textarea
                      value={draft.welcome_message}
                      onChange={(event) => editDraft({ ...draft, welcome_message: event.target.value })}
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        {
                          key: "uploads_enabled",
                          title: "Permitir nuevas cargas",
                          detail: "Invitados pueden subir archivos.",
                        },
                        {
                          key: "gallery_enabled",
                          title: "Mostrar galería pública",
                          detail: "Las fotos aprobadas quedan visibles.",
                        },
                        {
                          key: "live_enabled",
                          title: "Activar pantalla en vivo",
                          detail: "Muestra los recuerdos aprobados en la pantalla de la fiesta.",
                        },
                        {
                          key: "moderation_enabled",
                          title: "Moderar antes de mostrar",
                          detail: "Las nuevas cargas quedan pendientes.",
                        },
                        {
                          key: "allow_videos",
                          title: "Permitir videos",
                          detail: "Acepta clips además de fotografías.",
                        },
                        {
                          key: "missions_enabled",
                          title: "Mostrar misiones",
                          detail: "Activa las consignas de fotos.",
                        },
                        {
                          key: "people_enabled",
                          title: "Mostrar Invitados de la fiesta",
                          detail: "Permite conocer a otros invitados que eligen compartir su perfil.",
                        },
                        {
                          key: "sparks_enabled",
                          title: "Activar Chispas",
                          detail: "Elecciones mutuas y participación opcional.",
                        },
                        {
                          key: "instagram_on_match",
                          title: "Compartir Instagram en matches",
                          detail: "Solo entre las dos personas que se eligieron.",
                        },
                        {
                          key: "likes_enabled",
                          title: "Likes en recuerdos",
                          detail: "Permite elegir las fotos más queridas.",
                        },
                        { key: "show_guest_names", title: "Mostrar nombres", detail: "En galería y pantalla en vivo." },
                      ] as const
                    ).map(({ key, title, detail }) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--cream)] p-4"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0 accent-[var(--moss)]"
                          disabled={
                            migrationMissing &&
                            ["people_enabled", "sparks_enabled", "instagram_on_match", "likes_enabled"].includes(key)
                          }
                          checked={draft[key]}
                          onChange={(event) => editDraft({ ...draft, [key]: event.target.checked })}
                        />
                        <span>
                          <span className="block text-sm font-semibold">{title}</span>
                          <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Cupo de recuerdos por invitado (0 = sin límite)">
                      <Input
                        required
                        type="number"
                        disabled={migrationMissing}
                        min={0}
                        max={1000}
                        step={1}
                        value={draft.max_uploads_per_guest}
                        onChange={(e) => editDraft({ ...draft, max_uploads_per_guest: Number(e.target.value) })}
                      />
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Fotos y videos cuentan como un recuerdo. Cambiar el nombre mantiene el cupo.
                      </p>
                    </Field>
                    <Field label="Revelar galería automáticamente">
                      <Input
                        disabled={migrationMissing}
                        type="datetime-local"
                        value={
                          draft.gallery_reveal_at
                            ? new Date(
                                Date.parse(draft.gallery_reveal_at) -
                                  new Date(draft.gallery_reveal_at).getTimezoneOffset() * 60000,
                              )
                                .toISOString()
                                .slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          editDraft({
                            ...draft,
                            gallery_reveal_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                          })
                        }
                      />
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Horario de este dispositivo. Dejalo vacío para no programar la apertura. La pantalla en vivo es
                        independiente.
                      </p>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Cambio de foto (seg.)">
                      <Input
                        required
                        type="number"
                        min={3}
                        max={60}
                        value={draft.live_interval_seconds}
                        onChange={(e) => editDraft({ ...draft, live_interval_seconds: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Máx. foto (MB)">
                      <Input
                        required
                        type="number"
                        min={1}
                        max={100}
                        value={draft.max_photo_mb}
                        onChange={(e) => editDraft({ ...draft, max_photo_mb: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Máx. video (MB)">
                      <Input
                        required
                        type="number"
                        min={10}
                        max={1000}
                        value={draft.max_video_mb}
                        onChange={(e) => editDraft({ ...draft, max_video_mb: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Máx. video (seg.)">
                      <Input
                        required
                        type="number"
                        min={5}
                        max={600}
                        value={draft.max_video_seconds}
                        onChange={(e) => editDraft({ ...draft, max_video_seconds: Number(e.target.value) })}
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Link de pantalla
                    </p>
                    <p className="mt-2 break-all text-sm">{liveUrl}</p>
                  </div>
                </div>
                <Button type="submit" className="mt-5 w-full" disabled={saving || !!busyId || !dirty}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar ajustes
                </Button>
              </fieldset>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === "media" ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-3xl">Conservar los recuerdos</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Descargá los archivos originales en un ZIP. Las descargas grandes pueden tardar unos minutos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="flex items-center gap-2 rounded-xl bg-[var(--moss)] px-4 py-3 text-sm text-white"
                href={`/api/album/download?albumId=${album.id}`}
                onClick={handleDownload}
              >
                <Download size={16} /> Álbum completo
              </a>
              <a
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-3 text-sm"
                href={`/api/album/download?albumId=${album.id}&favorites=1`}
                onClick={(event) => handleDownload(event, true)}
              >
                <Heart size={16} /> Favoritas
              </a>
            </div>
          </div>
          {downloadNotice ? (
            <div
              role="status"
              className="mt-5 flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--cream)] p-4"
            >
              <Heart size={20} className="mt-0.5 shrink-0 text-[var(--burgundy)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{downloadNotice.title}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{downloadNotice.description}</p>
                {stats.ready > 0 ? (
                  <a
                    href="#album-media"
                    className="mt-2 inline-block text-sm font-medium text-[var(--moss)] underline underline-offset-4"
                  >
                    Elegir favoritas ↓
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDownloadNotice(null)}
                aria-label="Cerrar aviso de descarga"
                className="shrink-0 rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--cream-2)]"
              >
                <X size={18} />
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}
      {tab === "people" && migrationMissing ? (
        <Card className="p-5">
          <p className="text-sm text-[var(--muted)]">La sección de participantes todavía no está disponible.</p>
        </Card>
      ) : null}
      {tab === "people" && !migrationMissing ? (
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-serif text-3xl">
            <Users size={23} />
            Participantes y reportes
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {guests.filter((g) => g.social_enabled && !g.blocked).length} perfiles visibles · {socialStats.sparks}{" "}
            Chispas · {socialStats.matches} matches
          </p>
          <Input
            aria-label="Buscar participantes"
            className="mt-4 w-full min-w-0"
            placeholder="Buscar por nombre"
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
          />
          {!visibleGuests.length ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {guests.length ? "Sin coincidencias con esa búsqueda." : "Todavía no se sumaron participantes."}
            </p>
          ) : null}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {visibleGuests.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3"
              >
                <span className="min-w-0 break-words text-sm font-semibold">
                  {g.display_name}
                  {g.blocked ? " · bloqueado" : ""}
                </span>
                <button
                  className={`rounded-lg px-3 py-2 text-xs ${g.blocked ? "bg-[var(--moss-soft)] text-[var(--moss)]" : "bg-red-50 text-red-600"}`}
                  disabled={!!busyId || saving}
                  onClick={() => blockGuest(g)}
                >
                  {g.blocked ? "Desbloquear" : "Bloquear"}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Bloquear detiene nuevas cargas e interacciones y oculta su perfil. Podés revisar sus fotos desde la
            moderación.
          </p>
          {reports.length ? (
            <div className="mt-6 space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl bg-amber-50 p-4">
                  <p className="text-sm font-semibold">
                    {r.media_id
                      ? `Recuerdo: ${media.find((m) => m.id === r.media_id)?.original_filename || r.media_id}`
                      : `Persona: ${guests.find((g) => g.id === r.reported_guest_id)?.display_name || "Invitado"}`}
                  </p>
                  <p className="mt-2 text-sm">{r.reason}</p>
                  <button
                    className="mt-3 text-xs underline"
                    disabled={!!busyId || saving}
                    onClick={() => resolveReport(r.id)}
                  >
                    Marcar como revisado
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-[var(--muted)]">No hay reportes pendientes.</p>
          )}
        </Card>
      ) : null}

      {tab === "missions" ? (
        <Card className="p-5 sm:p-6">
          <p className="mb-4 text-sm text-[var(--muted)]">
            Consignas para animar a los invitados a capturar momentos. Ocultar una misión conserva sus recuerdos.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--burgundy)]">Consignas</p>
              <h2 className="mt-1 font-serif text-3xl">Misiones de fotos</h2>
            </div>
            <form onSubmit={addMission} className="flex w-full min-w-0 flex-wrap gap-2 sm:max-w-md">
              <Input
                aria-label="Nueva misión"
                disabled={!!busyId || saving}
                className="min-w-0 flex-1"
                value={newMission}
                onChange={(event) => setNewMission(event.target.value)}
                placeholder="Nueva misión..."
              />
              <Button type="submit" disabled={!!busyId || saving || !newMission.trim()}>
                <Plus size={16} /> Agregar
              </Button>
            </form>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className={`flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 ${mission.active ? "bg-[var(--cream)]" : "bg-neutral-100"}`}
              >
                <button
                  disabled={!!busyId || saving}
                  onClick={() => toggleMission(mission)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="break-words text-sm font-semibold">{mission.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {mission.active ? "Visible" : "Oculta"} · orden {mission.sort_order}
                  </p>
                </button>
                <Button
                  aria-label={`Eliminar misión ${mission.title}`}
                  disabled={!!busyId || saving}
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMission(mission)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "media" ? (
        <section id="album-media" className="scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--moss)]">Moderación y selección</p>
              <h2 className="mt-1 font-serif text-4xl">Fotos y videos</h2>
            </div>
            <Button variant="secondary" disabled={!!busyId || saving} onClick={load}>
              <RefreshCw size={16} /> Actualizar
            </Button>
          </div>

          <Card className="mt-4 space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="relative min-w-0">
                <Search size={16} className="absolute left-3 top-3 text-[var(--muted)]" />
                <Input
                  aria-label="Buscar recuerdos"
                  className="w-full min-w-0 pl-9"
                  value={search}
                  placeholder="Nombre de invitado o archivo"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="Filtrar recuerdos"
                className="h-10 min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
                value={mediaFilter}
                onChange={(e) => setMediaFilter(e.target.value)}
              >
                <option value="all">Todos los recuerdos</option>
                <option value="pending">Por aprobar</option>
                <option value="approved">Aprobados</option>
                <option value="rejected">Rechazados</option>
                <option value="hidden">Ocultos</option>
                <option value="favorites">Favoritas</option>
                <option value="photo">Fotos</option>
                <option value="video">Videos</option>
                <option value="uploading">Subiendo</option>
                <option value="failed">Carga fallida</option>
              </select>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
              <span>
                {visibleMedia.length} de {media.length} recuerdos
              </span>
              {search || mediaFilter !== "all" ? (
                <button
                  className="font-semibold text-[var(--moss)]"
                  onClick={() => {
                    setSearch("");
                    setMediaFilter("all");
                  }}
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          </Card>
          {visibleMedia.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleMedia.map((item) => (
                <Card key={item.id} className="min-w-0 overflow-hidden">
                  <div className="relative aspect-[4/3] bg-[var(--cream-2)]">
                    {item.upload_state === "ready" ? (
                      <img
                        src={albumMediaUrl(item.id, "preview", true)}
                        alt={item.original_filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted)]">
                        {item.upload_state === "uploading" ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : (
                          <ImageIcon size={24} />
                        )}
                        {item.upload_state === "uploading" ? "En proceso de carga" : "No se completó la carga"}
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.moderation_status === "approved" ? "bg-emerald-100 text-emerald-800" : item.moderation_status === "pending" ? "bg-amber-100 text-amber-800" : "bg-neutral-200 text-neutral-700"}`}
                      >
                        {item.upload_state !== "ready"
                          ? item.upload_state === "failed"
                            ? "Carga fallida"
                            : "Subiendo"
                          : { approved: "Aprobado", pending: "Por aprobar", hidden: "Oculto", rejected: "Rechazado" }[
                              item.moderation_status
                            ]}
                      </span>
                      {item.media_type === "video" ? (
                        <span className="rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
                          VIDEO
                        </span>
                      ) : null}
                    </div>
                    {item.favorite ? (
                      <Heart size={18} fill="currentColor" className="absolute right-3 top-3 text-white drop-shadow" />
                    ) : null}
                  </div>

                  <div className="p-4">
                    <p className="truncate text-sm font-semibold">{item.guest_name || "Invitado anónimo"}</p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">
                      {item.original_filename} · {formatBytes(Number(item.file_size_bytes))}
                    </p>

                    {item.upload_state === "ready" && item.moderation_status !== "approved" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            patchMedia(item.id, {
                              moderation_status: "approved",
                              show_in_gallery: true,
                              show_in_live: true,
                            })
                          }
                          disabled={!!busyId || saving}
                        >
                          <Check size={15} /> Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patchMedia(item.id, {
                              moderation_status: "rejected",
                              show_in_gallery: false,
                              show_in_live: false,
                            })
                          }
                          disabled={!!busyId || saving}
                        >
                          <X size={15} /> Rechazar
                        </Button>
                      </div>
                    ) : null}

                    <p className="mt-3 text-[11px] text-[var(--muted)]">
                      {item.moderation_status === "approved" && item.upload_state === "ready"
                        ? `Galería: ${item.show_in_gallery ? "visible" : "oculta"} · Pantalla: ${item.show_in_live ? "visible" : "oculta"}`
                        : "Este recuerdo todavía no se muestra al público."}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-1">
                      <button
                        aria-label={`Favorita: ${item.original_filename}`}
                        aria-pressed={item.favorite}
                        disabled={!!busyId || saving || item.upload_state !== "ready"}
                        title="Favorita"
                        onClick={() => patchMedia(item.id, { favorite: !item.favorite })}
                        className={`flex h-9 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40 ${item.favorite ? "bg-[var(--burgundy-soft)] text-[var(--burgundy)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}
                      >
                        <Heart size={16} fill={item.favorite ? "currentColor" : "none"} />
                      </button>
                      <button
                        aria-label={`Mostrar en galería: ${item.original_filename}`}
                        aria-pressed={item.show_in_gallery}
                        disabled={
                          !!busyId || saving || item.upload_state !== "ready" || item.moderation_status !== "approved"
                        }
                        title="Mostrar en galería"
                        onClick={() => patchMedia(item.id, { show_in_gallery: !item.show_in_gallery })}
                        className={`flex h-9 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40 ${item.show_in_gallery ? "bg-[var(--moss-soft)] text-[var(--moss)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}
                      >
                        {item.show_in_gallery ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        aria-label={`Mostrar en pantalla: ${item.original_filename}`}
                        aria-pressed={item.show_in_live}
                        disabled={
                          !!busyId || saving || item.upload_state !== "ready" || item.moderation_status !== "approved"
                        }
                        title="Mostrar en pantalla"
                        onClick={() => patchMedia(item.id, { show_in_live: !item.show_in_live })}
                        className={`flex h-9 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40 ${item.show_in_live ? "bg-[var(--moss-soft)] text-[var(--moss)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}
                      >
                        <MonitorPlay size={16} />
                      </button>
                    </div>

                    <div className="mt-2 flex gap-2">
                      {item.upload_state === "ready" ? (
                        <a
                          href={albumMediaUrl(item.id, "original", true)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-9 flex-1 items-center justify-center rounded-lg border border-[var(--line)] text-xs font-medium hover:bg-[var(--cream)]"
                        >
                          Ver original
                        </a>
                      ) : (
                        <span className="flex flex-1 items-center justify-center text-xs text-[var(--muted)]">
                          Original no disponible
                        </span>
                      )}
                      <button
                        aria-label={`Eliminar ${item.original_filename}`}
                        onClick={() => removeMedia(item)}
                        disabled={!!busyId || saving}
                        className="flex h-9 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="mt-5 p-12 text-center">
              <ImageIcon size={30} className="mx-auto text-[var(--moss)]" />
              <h3 className="mt-4 font-serif text-2xl">
                {media.length ? "Sin coincidencias" : "Todavía no hay recuerdos"}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {media.length
                  ? "Probá otra búsqueda o limpiá los filtros."
                  : "Compartí el enlace del álbum o el QR desde Accesos y ajustes. Las fotos aparecerán acá."}
              </p>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
