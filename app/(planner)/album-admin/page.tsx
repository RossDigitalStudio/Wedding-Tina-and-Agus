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
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: albumData } = await supabase
      .from("wedding_albums")
      .select("*")
      .eq("wedding_id", wedding.id)
      .maybeSingle();

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

    setGuests(guestResult.data || []);
    setReports(reportResult.data || []);
    setMigrationMissing(!!guestResult.error || albumData.max_uploads_per_guest === undefined);
    if (!guestResult.error) {
      const response = await fetch(`/api/album/admin-stats?albumId=${albumData.id}`);
      if (response.ok) setSocialStats(await response.json());
    }
    setAlbum(albumData as WeddingAlbum);
    setMedia((mediaResult.data || []) as AlbumMedia[]);
    setMissions((missionResult.data || []) as AlbumMission[]);
    setDraft({
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
    });
    setLoading(false);
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

  async function saveSettings() {
    if (!album || !draft) return;
    if (
      !Number.isInteger(draft.max_uploads_per_guest) ||
      draft.max_uploads_per_guest < 0 ||
      draft.max_uploads_per_guest > 1000
    ) {
      alert("El cupo debe ser un entero entre 0 y 1000.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
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
    const { error } = await supabase.from("wedding_albums").update(patch).eq("id", album.id);
    setSaving(false);
    if (!error) await load();
    else alert(error.message);
  }

  async function patchMedia(id: string, patch: Partial<AlbumMedia>) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("album_media").update(patch).eq("id", id);
    setBusyId(null);
    if (error) alert(error.message);
    else setMedia((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function removeMedia(item: AlbumMedia) {
    if (!confirm(`¿Eliminar definitivamente “${item.original_filename}”? También se borrará de R2.`)) return;
    setBusyId(item.id);
    const response = await fetch(`/api/album/media/${item.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      alert(body.error || "No pudimos eliminar el archivo.");
      return;
    }
    setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id));
  }

  async function addMission(event: React.FormEvent) {
    event.preventDefault();
    if (!album || !newMission.trim()) return;
    const supabase = createClient();
    const { error } = await supabase.from("album_missions").insert({
      album_id: album.id,
      wedding_id: wedding.id,
      title: newMission.trim(),
      active: true,
      sort_order: (missions[missions.length - 1]?.sort_order || 0) + 10,
    });
    if (error) alert(error.message);
    else {
      setNewMission("");
      await load();
    }
  }

  async function toggleMission(mission: AlbumMission) {
    const supabase = createClient();
    await supabase.from("album_missions").update({ active: !mission.active }).eq("id", mission.id);
    setMissions((current) =>
      current.map((item) => (item.id === mission.id ? { ...item, active: !item.active } : item)),
    );
  }

  async function deleteMission(mission: AlbumMission) {
    if (!confirm(`¿Eliminar la misión “${mission.title}”?`)) return;
    const supabase = createClient();
    await supabase.from("album_missions").delete().eq("id", mission.id);
    setMissions((current) => current.filter((item) => item.id !== mission.id));
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
          description="No encontramos un álbum asociado a esta boda. Revisá que la migración 004_album_digital.sql se haya ejecutado."
        />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="QR · galería · pantalla en vivo"
        title="Álbum digital"
        description="Administrá todo lo que los invitados compartan durante la fiesta, sin que necesiten registrarse."
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={publicUrl}
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--cream-2)]"
            >
              <Eye size={16} /> Ver álbum
            </a>
            <a
              href={liveUrl}
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white hover:opacity-90"
            >
              <MonitorPlay size={16} /> Pantalla en vivo
            </a>
          </div>
        }
      />

      {migrationMissing ? (
        <Card className="border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold">Falta actualizar la base de datos del álbum</p>
          <p className="mt-2 text-sm">
            Ejecutá supabase/005_album_guests_social.sql en Supabase antes de probar el ingreso y las funciones
            sociales.
          </p>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Recuerdos", stats.ready, ImageIcon],
          ["Participantes", stats.participants, Upload],
          ["Favoritas", stats.favorites, Heart],
          ["Pendientes", stats.pending, ShieldCheck],
          ["Almacenado", formatBytes(stats.bytes), Film],
        ].map(([label, value, Icon]) => {
          const IconComponent = Icon as typeof ImageIcon;
          return (
            <Card key={String(label)} className="p-4">
              <IconComponent size={18} className="text-[var(--moss)]" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {String(label)}
              </p>
              <p className="mt-1 text-2xl font-semibold">{String(value)}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
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
                className="mx-auto w-full max-w-64 rounded-2xl border border-[var(--line)] bg-white p-2"
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--moss)] px-4 text-sm font-medium text-white hover:brightness-95"
              >
                <QrCode size={16} /> Abrir QR
              </a>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
              El QR se genera con QuickChart a partir de la URL pública. Antes de imprimirlo, escanealo una vez desde
              otro celular.
            </p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--moss)]">Control general</p>
              <h2 className="mt-1 font-serif text-3xl">Configuración del álbum</h2>
            </div>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
            </Button>
          </div>

          <div className="mt-6 grid gap-4">
            <Field label="Mensaje de bienvenida">
              <Textarea
                value={draft.welcome_message}
                onChange={(event) => setDraft({ ...draft, welcome_message: event.target.value })}
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
                  { key: "live_enabled", title: "Activar pantalla en vivo", detail: "Habilita /album/live." },
                  {
                    key: "moderation_enabled",
                    title: "Moderar antes de mostrar",
                    detail: "Las nuevas cargas quedan pendientes.",
                  },
                  { key: "allow_videos", title: "Permitir videos", detail: "Acepta clips además de fotografías." },
                  { key: "missions_enabled", title: "Mostrar misiones", detail: "Activa las consignas de fotos." },
                  {
                    key: "people_enabled",
                    title: "Mostrar Quién está",
                    detail: "Solo aparecen quienes eligen participar.",
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
                    className="mt-1"
                    checked={draft[key]}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
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
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  value={draft.max_uploads_per_guest}
                  onChange={(e) => setDraft({ ...draft, max_uploads_per_guest: Number(e.target.value) })}
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Fotos y videos cuentan como un recuerdo. Cambiar el nombre mantiene el cupo.
                </p>
              </Field>
              <Field label="Revelar galería automáticamente">
                <Input
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
                    setDraft({
                      ...draft,
                      gallery_reveal_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Horario de este dispositivo. Dejalo vacío para mostrarla ahora. La pantalla en vivo es independiente.
                </p>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Cambio de foto (seg.)">
                <Input
                  type="number"
                  min={3}
                  max={60}
                  value={draft.live_interval_seconds}
                  onChange={(e) => setDraft({ ...draft, live_interval_seconds: Number(e.target.value) })}
                />
              </Field>
              <Field label="Máx. foto (MB)">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.max_photo_mb}
                  onChange={(e) => setDraft({ ...draft, max_photo_mb: Number(e.target.value) })}
                />
              </Field>
              <Field label="Máx. video (MB)">
                <Input
                  type="number"
                  min={10}
                  max={1000}
                  value={draft.max_video_mb}
                  onChange={(e) => setDraft({ ...draft, max_video_mb: Number(e.target.value) })}
                />
              </Field>
              <Field label="Máx. video (seg.)">
                <Input
                  type="number"
                  min={5}
                  max={600}
                  value={draft.max_video_seconds}
                  onChange={(e) => setDraft({ ...draft, max_video_seconds: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Link de pantalla</p>
              <p className="mt-2 break-all text-sm">{liveUrl}</p>
            </div>
          </div>
        </Card>
      </div>

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
            >
              <Download size={16} /> Álbum completo
            </a>
            <a
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-3 text-sm"
              href={`/api/album/download?albumId=${album.id}&favorites=1`}
            >
              <Heart size={16} /> Favoritas
            </a>
          </div>
        </div>
      </Card>
      {!migrationMissing ? (
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-serif text-3xl">
            <Users size={23} />
            Participantes y reportes
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {guests.filter((g) => g.social_enabled && !g.blocked).length} perfiles visibles · {socialStats.sparks}{" "}
            Chispas · {socialStats.matches} matches
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {guests.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3"
              >
                <span className="text-sm font-semibold">
                  {g.display_name}
                  {g.blocked ? " · bloqueado" : ""}
                </span>
                <button
                  className={`rounded-lg px-3 py-2 text-xs ${g.blocked ? "bg-[var(--moss-soft)] text-[var(--moss)]" : "bg-red-50 text-red-600"}`}
                  onClick={async () => {
                    const { error } = await createClient()
                      .from("album_guests")
                      .update({ blocked: !g.blocked })
                      .eq("id", g.id);
                    if (error) alert(error.message);
                    else await load();
                  }}
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
                    onClick={async () => {
                      const { error } = await createClient()
                        .from("album_reports")
                        .update({ resolved: true })
                        .eq("id", r.id);
                      if (error) alert(error.message);
                      else await load();
                    }}
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

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--burgundy)]">Consignas</p>
            <h2 className="mt-1 font-serif text-3xl">Misiones de fotos</h2>
          </div>
          <form onSubmit={addMission} className="flex w-full gap-2 sm:max-w-md">
            <Input
              value={newMission}
              onChange={(event) => setNewMission(event.target.value)}
              placeholder="Nueva misión..."
            />
            <Button type="submit">
              <Plus size={16} /> Agregar
            </Button>
          </form>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {missions.map((mission) => (
            <div
              key={mission.id}
              className={`flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 ${mission.active ? "bg-[var(--cream)]" : "bg-neutral-100 opacity-60"}`}
            >
              <button onClick={() => toggleMission(mission)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold">{mission.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {mission.active ? "Visible" : "Oculta"} · orden {mission.sort_order}
                </p>
              </button>
              <Button variant="ghost" size="sm" onClick={() => deleteMission(mission)}>
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--moss)]">Moderación y selección</p>
            <h2 className="mt-1 font-serif text-4xl">Fotos y videos</h2>
          </div>
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={16} /> Actualizar
          </Button>
        </div>

        {media.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {media.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="relative aspect-[4/3] bg-[var(--cream-2)]">
                  <img
                    src={albumMediaUrl(item.id, "preview", true)}
                    alt={item.original_filename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.moderation_status === "approved" ? "bg-emerald-100 text-emerald-800" : item.moderation_status === "pending" ? "bg-amber-100 text-amber-800" : "bg-neutral-200 text-neutral-700"}`}
                    >
                      {item.moderation_status}
                    </span>
                    {item.media_type === "video" ? (
                      <span className="rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">VIDEO</span>
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

                  {item.moderation_status === "pending" ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        onClick={() => patchMedia(item.id, { moderation_status: "approved" })}
                        disabled={busyId === item.id}
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
                        disabled={busyId === item.id}
                      >
                        <X size={15} /> Rechazar
                      </Button>
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-3 gap-1">
                    <button
                      title="Favorita"
                      onClick={() => patchMedia(item.id, { favorite: !item.favorite })}
                      className={`flex h-9 items-center justify-center rounded-lg ${item.favorite ? "bg-[var(--burgundy-soft)] text-[var(--burgundy)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}
                    >
                      <Heart size={16} fill={item.favorite ? "currentColor" : "none"} />
                    </button>
                    <button
                      title="Mostrar en galería"
                      onClick={() => patchMedia(item.id, { show_in_gallery: !item.show_in_gallery })}
                      className={`flex h-9 items-center justify-center rounded-lg ${item.show_in_gallery ? "bg-[var(--moss-soft)] text-[var(--moss)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}
                    >
                      {item.show_in_gallery ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      title="Mostrar en pantalla"
                      onClick={() => patchMedia(item.id, { show_in_live: !item.show_in_live })}
                      className={`flex h-9 items-center justify-center rounded-lg ${item.show_in_live ? "bg-[var(--moss-soft)] text-[var(--moss)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}
                    >
                      <MonitorPlay size={16} />
                    </button>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <a
                      href={albumMediaUrl(item.id, "original", true)}
                      target="_blank"
                      className="flex h-9 flex-1 items-center justify-center rounded-lg border border-[var(--line)] text-xs font-medium hover:bg-[var(--cream)]"
                    >
                      Ver original
                    </a>
                    <button
                      onClick={() => removeMedia(item)}
                      disabled={busyId === item.id}
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
            <h3 className="mt-4 font-serif text-2xl">Todavía no hay cargas</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Cuando alguien use el QR, sus fotos aparecerán acá.</p>
          </Card>
        )}
      </section>
    </div>
  );
}
