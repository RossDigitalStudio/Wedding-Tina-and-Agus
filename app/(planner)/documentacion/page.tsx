"use client";

import { ClipboardList, ExternalLink, FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { WeddingDocument } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const blank = { category: "Civil", title: "", status: "missing", due_date: "", notes: "", source_url: "" };

export default function DocumentsPage() {
  const { wedding } = useWedding();
  const [documents, setDocuments] = useState<WeddingDocument[]>([]);
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WeddingDocument | null>(null);
  const [draft, setDraft] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("documents")
        .select("*")
        .eq("wedding_id", wedding.id)
        .is("vendor_id", null)
        .order("category")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (loadError) throw new Error("No pudimos cargar la documentación. Reintentá en unos segundos.");
      setDocuments((data || []) as WeddingDocument[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los documentos.");
    } finally {
      setLoading(false);
    }
  }, [wedding.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const today = format(new Date(), "yyyy-MM-dd");
  const isOverdue = (doc: WeddingDocument) =>
    !!doc.due_date && doc.due_date < today && doc.status !== "ready" && doc.status !== "delivered";
  const visible = useMemo(
    () =>
      documents
        .filter(
          (doc) =>
            (filter === "all" || doc.category === filter) &&
            (statusFilter === "all" ||
              (statusFilter === "overdue"
                ? !!doc.due_date && doc.due_date < today && !["ready", "delivered"].includes(doc.status)
                : doc.status === statusFilter)) &&
            normalize([doc.title, doc.notes, doc.filename].join(" ")).includes(normalize(search)),
        )
        .sort(
          (a, b) =>
            Number(!!b.due_date && b.due_date < today && !["ready", "delivered"].includes(b.status)) -
              Number(!!a.due_date && a.due_date < today && !["ready", "delivered"].includes(a.status)) ||
            (a.due_date || "9999").localeCompare(b.due_date || "9999"),
        ),
    [documents, filter, statusFilter, search, today],
  );
  const ready = documents.filter((d) => d.status === "ready" || d.status === "delivered").length;

  function openNew() {
    setFormError("");
    setEditing(null);
    setDraft(blank);
    setModalOpen(true);
  }
  function openEdit(doc: WeddingDocument) {
    setFormError("");
    setEditing(doc);
    setDraft({
      category: doc.category,
      title: doc.title,
      status: doc.status,
      due_date: doc.due_date || "",
      notes: doc.notes || "",
      source_url: doc.source_url || "",
    });
    setModalOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || uploading) return;
    setFormError("");
    if (!draft.title.trim()) {
      setFormError("Completá el nombre antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        wedding_id: wedding.id,
        category: draft.category,
        title: draft.title.trim(),
        status: draft.status,
        due_date: draft.due_date || null,
        notes: draft.notes.trim() || null,
        source_url: draft.source_url.trim() || null,
      };
      const result = editing
        ? await supabase
            .from("documents")
            .update(payload)
            .eq("id", editing.id)
            .eq("wedding_id", wedding.id)
            .select("id")
            .single()
        : await supabase.from("documents").insert(payload).select("id").single();
      if (result.error) throw result.error;
      setModalOpen(false);
      setNotice("Cambios guardados.");
      await load();
    } catch {
      setFormError("No pudimos guardar. Tus datos siguen acá para reintentar.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(doc: WeddingDocument, status: WeddingDocument["status"]) {
    if (saving || uploading) return;
    setSaving(true);
    setError("");
    try {
      const { error } = await createClient()
        .from("documents")
        .update({ status })
        .eq("id", doc.id)
        .eq("wedding_id", wedding.id)
        .select("id")
        .single();
      if (error) throw error;
      setNotice("Estado actualizado.");
      await load();
    } catch {
      setError("No pudimos cambiar el estado. Reintentá en unos segundos.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(doc: WeddingDocument, file?: File) {
    if (!file || uploading || saving) return;
    if (!/\.pdf$/i.test(file.name) && !file.type.startsWith("image/")) {
      setError("Elegí un PDF o una imagen.");
      return;
    }
    setUploading(doc.id);
    setError("");
    const supabase = createClient();
    const path = `${wedding.id}/documents/${doc.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    let uploaded = false;
    try {
      const result = await supabase.storage
        .from("wedding-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (result.error) throw result.error;
      uploaded = true;
      const { error } = await supabase
        .from("documents")
        .update({
          storage_path: path,
          filename: file.name,
          mime_type: file.type || null,
          status: doc.status === "delivered" ? "delivered" : "ready",
        })
        .eq("id", doc.id)
        .eq("wedding_id", wedding.id)
        .select("id")
        .single();
      if (error) throw error;
      uploaded = false;
      if (doc.storage_path) {
        const cleanup = await supabase.storage.from("wedding-documents").remove([doc.storage_path]);
        if (cleanup.error) setNotice("Archivo actualizado. No se pudo limpiar la copia anterior.");
        else setNotice("Archivo actualizado.");
      } else setNotice("Archivo adjuntado.");
      await load();
    } catch {
      if (uploaded) await supabase.storage.from("wedding-documents").remove([path]);
      setError(
        "No pudimos adjuntar el archivo. El archivo anterior sigue disponible; volvé a seleccionar el nuevo para reintentar.",
      );
    } finally {
      setUploading(null);
    }
  }

  async function viewFile(doc: WeddingDocument) {
    if (!doc.storage_path) return;
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    try {
      const { data, error } = await createClient()
        .storage.from("wedding-documents")
        .createSignedUrl(doc.storage_path, 120);
      if (error || !data?.signedUrl) throw error;
      if (preview) preview.location.href = data.signedUrl;
      else setError("El navegador bloqueó la apertura del archivo. Permití las ventanas emergentes y volvé a abrirlo.");
    } catch {
      preview?.close();
      setError("No pudimos abrir el archivo. Reintentá en unos segundos.");
    }
  }

  async function remove() {
    if (!editing || saving || !confirm(`¿Eliminar “${editing.title}”?`)) return;
    setSaving(true);
    setFormError("");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", editing.id)
        .eq("wedding_id", wedding.id)
        .select("id")
        .single();
      if (error) throw error;
      if (editing.storage_path) {
        const cleanup = await supabase.storage.from("wedding-documents").remove([editing.storage_path]);
        if (cleanup.error) setNotice("Documento eliminado. No se pudo limpiar el archivo almacenado.");
        else setNotice("Documento eliminado.");
      } else setNotice("Documento eliminado.");
      setModalOpen(false);
      await load();
    } catch {
      setFormError("No pudimos eliminar. Reintentá en unos segundos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Cada papel, un paso más cerca"
        title="Documentación"
        description="Lo que falta, lo que está en trámite y lo que ya tenemos listo para el civil y la iglesia."
        actions={
          <Button disabled={saving || uploading !== null} onClick={openNew}>
            <Plus size={17} /> Agregar documento
          </Button>
        }
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-[var(--moss-soft)] p-3 text-sm">
          {notice}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="min-w-0 p-4">
          <p className="text-xs text-[var(--muted)]">Documentos</p>
          <p className="mt-2 font-serif text-3xl">{loading ? "—" : documents.length}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Nuestro checklist</p>
        </Card>
        <Card className="min-w-0 p-4">
          <p className="text-xs text-[var(--muted)]">Listos o entregados</p>
          <p className="mt-2 font-serif text-3xl">{loading ? "—" : ready}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {loading ? "Cargando…" : `${documents.length - ready} por resolver`}
          </p>
        </Card>
        <div className="col-span-2 rounded-2xl bg-[var(--ink)] p-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-white/60">Preparación documental</p>
              <p className="mt-1 font-serif text-xl">Un paso a la vez</p>
            </div>
            <p className="font-serif text-3xl">
              {loading ? "—" : `${documents.length ? Math.round((ready / documents.length) * 100) : 0}%`}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Preparación documental"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={documents.length ? Math.round((ready / documents.length) * 100) : 0}
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15"
          >
            <div
              className="h-full rounded-full bg-[var(--moss-soft)]"
              style={{ width: `${documents.length ? (ready / documents.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="Buscar documentos"
            className="w-full min-w-0"
            placeholder="Buscar título, archivo o notas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            aria-label="Filtrar estado documental"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="overdue">Fecha pasada · por resolver</option>
            <option value="missing">Falta</option>
            <option value="pending">En trámite</option>
            <option value="ready">Listo</option>
            <option value="delivered">Entregado</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            "all",
            ...Array.from(new Set(["Civil", "Iglesia", "General", ...documents.map((doc) => doc.category)])),
          ].map((item) => (
            <Button
              key={item}
              size="sm"
              variant={filter === item ? "primary" : "secondary"}
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "Todos" : item}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>
            {visible.length} de {documents.length} documentos
          </span>
          {search || filter !== "all" || statusFilter !== "all" ? (
            <button
              className="font-semibold text-[var(--moss)]"
              onClick={() => {
                setSearch("");
                setFilter("all");
                setStatusFilter("all");
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </Card>

      {loading ? (
        <p role="status" className="flex items-center gap-2 py-8 text-sm text-[var(--muted)]">
          <Loader2 size={18} className="animate-spin" /> Cargando documentos…
        </p>
      ) : visible.length ? (
        <div className="grid gap-3">
          {visible.map((doc) => (
            <Card key={doc.id} className={`min-w-0 p-4 sm:p-5 ${isOverdue(doc) ? "border-amber-300" : ""}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={doc.category === "Civil" ? "moss" : doc.category === "Iglesia" ? "burgundy" : "neutral"}
                    >
                      {doc.category}
                    </StatusBadge>
                    <StatusBadge
                      tone={
                        doc.status === "delivered" || doc.status === "ready"
                          ? "success"
                          : doc.status === "pending"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {doc.status === "missing"
                        ? "Falta"
                        : doc.status === "pending"
                          ? "En trámite"
                          : doc.status === "ready"
                            ? "Listo"
                            : "Entregado"}
                    </StatusBadge>
                  </div>
                  <h3 className="mt-2 break-words font-medium">{doc.title}</h3>
                  {doc.notes ? (
                    <p className="mt-1 break-words whitespace-pre-line text-sm leading-5 text-[var(--muted)]">
                      {doc.notes}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                    {doc.due_date ? (
                      <span className={isOverdue(doc) ? "font-semibold text-amber-800" : ""}>
                        {isOverdue(doc) ? "Fecha pasada · " : ""}Fecha objetivo:{" "}
                        {format(parseISO(doc.due_date), "d MMM yyyy", { locale: es })}
                      </span>
                    ) : null}
                    {doc.filename ? (
                      <button
                        onClick={() => viewFile(doc)}
                        className="inline-flex min-w-0 items-center gap-1 break-all font-semibold text-[var(--moss)] hover:underline"
                      >
                        <ExternalLink size={12} className="shrink-0" /> {doc.filename}
                      </button>
                    ) : null}
                    {doc.source_url ? (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[var(--moss)] hover:underline"
                      >
                        <ExternalLink size={12} /> Fuente / referencia
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 lg:w-auto">
                  <Select
                    aria-label={`Estado de ${doc.title}`}
                    disabled={saving || uploading !== null}
                    className="min-w-0 w-full lg:w-36"
                    value={doc.status}
                    onChange={(e) => updateStatus(doc, e.target.value as WeddingDocument["status"])}
                  >
                    <option value="missing">Falta</option>
                    <option value="pending">En trámite</option>
                    <option value="ready">Listo</option>
                    <option value="delivered">Entregado</option>
                  </Select>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-medium hover:bg-[var(--cream-2)]">
                    <FileUp size={15} />{" "}
                    {uploading === doc.id ? "Subiendo..." : doc.storage_path ? "Reemplazar" : "Adjuntar"}
                    <input
                      className="hidden"
                      type="file"
                      accept="application/pdf,image/*"
                      disabled={uploading !== null || saving}
                      onChange={(e) => {
                        void upload(doc, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button variant="ghost" size="sm" disabled={saving || uploading !== null} aria-label={`Editar ${doc.title}`} onClick={() => openEdit(doc)}>
                    <Pencil size={15} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={documents.length ? "Sin coincidencias" : "Nuestro checklist empieza acá"}
          description={
            documents.length
              ? "Probá otra búsqueda o limpiá los filtros."
              : "Agregá partidas, requisitos y archivos que necesitemos tener preparados."
          }
          action={
            <Button disabled={saving || uploading !== null} onClick={openNew}>
              <Plus size={16} /> Agregar documento
            </Button>
          }
        />
      )}

      <p className="text-xs leading-5 text-[var(--muted)]">
        Confirmá los requisitos y la vigencia de cada documento con el Registro Civil o la secretaría parroquial. Los
        contratos y comprobantes de proveedores están en Proveedores.
      </p>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editing ? "Editar documento" : "Nuevo documento"}
      >
        <form onSubmit={save}>
          <fieldset
            disabled={saving}
            className="grid min-w-0 gap-4 [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0 [&_label]:min-w-0"
          >
            {formError ? (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {formError}
              </p>
            ) : null}
            <Field label="Título">
              <Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Categoría">
                <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  <option>Civil</option>
                  <option>Iglesia</option>
                  <option>General</option>
                </Select>
              </Field>
              <Field label="Estado">
                <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="missing">Falta</option>
                  <option value="pending">En trámite</option>
                  <option value="ready">Listo</option>
                  <option value="delivered">Entregado</option>
                </Select>
              </Field>
            </div>
            <Field label="Fecha objetivo">
              <Input
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              />
            </Field>
            <Field label="Fuente / URL">
              <Input
                type="url"
                value={draft.source_url}
                onChange={(e) => setDraft({ ...draft, source_url: e.target.value })}
              />
            </Field>
            <Field label="Notas">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                {editing ? (
                  <Button type="button" variant="danger" onClick={remove}>
                    <Trash2 size={15} /> Eliminar
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : null} Guardar
                </Button>
              </div>
            </div>
          </fieldset>
        </form>
      </Modal>
    </div>
  );
}
