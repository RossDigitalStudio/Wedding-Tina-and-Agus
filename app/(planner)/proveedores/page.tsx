"use client";

import Link from "next/link";
import {
  Search,
  Instagram,
  ExternalLink,
  FileUp,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { useWedding } from "@/components/planner/wedding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { VENDOR_CATEGORIES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Vendor, WeddingDocument } from "@/lib/types";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const blank = {
  category: "Otros",
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  instagram: "",
  website: "",
  address: "",
  status: "contacted",
  notes: "",
};

export default function VendorsPage() {
  const { wedding } = useWedding();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [documents, setDocuments] = useState<WeddingDocument[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
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
      const [vendorRes, documentRes] = await Promise.all([
        supabase.from("vendors").select("*").eq("wedding_id", wedding.id).order("category").order("name"),
        supabase
          .from("documents")
          .select("*")
          .eq("wedding_id", wedding.id)
          .not("vendor_id", "is", null)
          .order("created_at", { ascending: false }),
      ]);
      if (vendorRes.error || documentRes.error)
        throw new Error("No pudimos cargar los proveedores y sus archivos. Reintentá en unos segundos.");
      setVendors((vendorRes.data || []) as Vendor[]);
      setDocuments((documentRes.data || []) as WeddingDocument[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los proveedores.");
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
  const docsByVendor = useMemo(() => {
    const map = new Map<string, WeddingDocument[]>();
    documents.forEach((doc) => doc.vendor_id && map.set(doc.vendor_id, [...(map.get(doc.vendor_id) || []), doc]));
    return map;
  }, [documents]);

  const visible = vendors.filter(
    (vendor) =>
      (categoryFilter === "all" || vendor.category === categoryFilter) &&
      (statusFilter === "all" || vendor.status === statusFilter) &&
      normalize([vendor.name, vendor.contact_name, vendor.category, vendor.notes].join(" ")).includes(
        normalize(search),
      ),
  );
  const contracted = vendors.filter((vendor) => vendor.status === "booked" || vendor.status === "paid").length;
  function externalUrl(value: string) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }
  function openNew() {
    setFormError("");
    setEditing(null);
    setDraft(blank);
    setModalOpen(true);
  }
  function openEdit(vendor: Vendor) {
    setFormError("");
    setEditing(vendor);
    setDraft({
      category: vendor.category,
      name: vendor.name,
      contact_name: vendor.contact_name || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      instagram: vendor.instagram || "",
      website: vendor.website || "",
      address: vendor.address || "",
      status: vendor.status,
      notes: vendor.notes || "",
    });
    setModalOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || uploading) return;
    setFormError("");
    if (!draft.name.trim()) {
      setFormError("Completá el nombre antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        wedding_id: wedding.id,
        category: draft.category,
        name: draft.name.trim(),
        contact_name: draft.contact_name.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        instagram: draft.instagram.trim() || null,
        website: draft.website.trim() || null,
        address: draft.address.trim() || null,
        status: draft.status,
        notes: draft.notes.trim() || null,
      };
      const result = editing
        ? await supabase
            .from("vendors")
            .update(payload)
            .eq("id", editing.id)
            .eq("wedding_id", wedding.id)
            .select("id")
            .single()
        : await supabase.from("vendors").insert(payload).select("id").single();
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

  async function remove() {
    if (!editing || saving || !confirm(`¿Eliminar “${editing.name}”?`)) return;
    setSaving(true);
    setFormError("");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("vendors")
        .delete()
        .eq("id", editing.id)
        .eq("wedding_id", wedding.id)
        .select("id")
        .single();
      if (error) throw error;
      setNotice("Proveedor eliminado.");
      setModalOpen(false);
      await load();
    } catch {
      setFormError("No pudimos eliminar. Reintentá en unos segundos.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(vendor: Vendor, file?: File) {
    if (!file || uploading || saving) return;
    if (!/\.pdf$/i.test(file.name) && !file.type.startsWith("image/")) {
      setError("Elegí un PDF o una imagen.");
      return;
    }
    setUploading(vendor.id);
    setError("");
    const supabase = createClient();
    const path = `${wedding.id}/vendors/${vendor.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    let uploaded = false;
    try {
      const result = await supabase.storage
        .from("wedding-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (result.error) throw result.error;
      uploaded = true;
      const { error } = await supabase
        .from("documents")
        .insert({
          wedding_id: wedding.id,
          vendor_id: vendor.id,
          category: "Proveedor",
          title: file.name,
          status: "ready",
          storage_path: path,
          filename: file.name,
          mime_type: file.type || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      uploaded = false;
      setNotice("Archivo adjuntado.");
      await load();
    } catch {
      if (uploaded) await supabase.storage.from("wedding-documents").remove([path]);
      setError("No pudimos adjuntar el archivo. Volvé a seleccionarlo para reintentar.");
    } finally {
      setUploading(null);
    }
  }

  async function openDocument(doc: WeddingDocument) {
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

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="El equipo de nuestro día"
        title="Proveedores"
        description="Contactos a mano, propuestas ordenadas y los detalles de cada contratación en un solo lugar."
        actions={
          <Button disabled={saving || uploading !== null} onClick={openNew}>
            <Plus size={17} /> Nuevo proveedor
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Proveedores", value: vendors.length },
          { label: "Contratados / pagados", value: contracted },
          {
            label: "Por decidir",
            value: vendors.filter((vendor) => vendor.status === "contacted" || vendor.status === "quoted").length,
          },
          { label: "Archivos", value: documents.length },
        ].map((stat) => (
          <Card key={stat.label} className="min-w-0 p-4">
            <p className="text-xs text-[var(--muted)]">{stat.label}</p>
            <p className="mt-2 font-serif text-3xl">{loading ? "—" : stat.value}</p>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="relative min-w-0">
            <Search size={16} className="absolute left-3 top-3 text-[var(--muted)]" />
            <Input
              aria-label="Buscar proveedores"
              className="w-full min-w-0 pl-9"
              placeholder="Nombre, contacto o notas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Select
            aria-label="Categoría de proveedor"
            className="min-w-0"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {Array.from(new Set([...VENDOR_CATEGORIES, ...vendors.map((v) => v.category)])).map((category) => (
              <option key={category}>{category}</option>
            ))}
          </Select>
          <Select
            aria-label="Estado de proveedor"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="contacted">Contactado</option>
            <option value="quoted">Cotizado</option>
            <option value="booked">Contratado</option>
            <option value="paid">Pagado</option>
            <option value="cancelled">Cancelado</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>
            {visible.length} de {vendors.length} proveedores
          </span>
          {search || categoryFilter !== "all" || statusFilter !== "all" ? (
            <button
              className="font-semibold text-[var(--moss)]"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
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
          <Loader2 size={18} className="animate-spin" /> Cargando proveedores…
        </p>
      ) : visible.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((vendor) => {
            const docs = docsByVendor.get(vendor.id) || [];
            return (
              <Card key={vendor.id} className="flex min-w-0 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge
                      tone={
                        vendor.status === "booked" || vendor.status === "paid"
                          ? "success"
                          : vendor.status === "quoted"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {vendor.status === "contacted"
                        ? "Contactado"
                        : vendor.status === "quoted"
                          ? "Cotizado"
                          : vendor.status === "booked"
                            ? "Contratado"
                            : vendor.status === "paid"
                              ? "Pagado"
                              : "Cancelado"}
                    </StatusBadge>
                    <h2 className="mt-3 break-words font-serif text-2xl">{vendor.name}</h2>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.1em] text-[var(--moss)]">
                      {vendor.category}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving || uploading !== null} aria-label={`Editar ${vendor.name}`}
                    onClick={() => openEdit(vendor)}
                  >
                    <Pencil size={16} />
                  </Button>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                  {vendor.contact_name ? <p>{vendor.contact_name}</p> : null}
                  {vendor.phone ? (
                    <p className="flex items-center gap-2">
                      <Phone size={14} className="shrink-0" />{" "}
                      <a className="break-all hover:underline" href={`tel:${vendor.phone.replace(/[^+0-9]/g, "")}`}>
                        {vendor.phone}
                      </a>
                    </p>
                  ) : null}
                  {vendor.email ? (
                    <p className="flex items-center gap-2">
                      <Mail size={14} className="shrink-0" />{" "}
                      <a className="break-all hover:underline" href={`mailto:${vendor.email}`}>
                        {vendor.email}
                      </a>
                    </p>
                  ) : null}
                  {vendor.address ? (
                    <p className="flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 shrink-0" /> {vendor.address}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[var(--moss)]">
                  {vendor.instagram ? (
                    <a
                      href={
                        externalUrl(
                          vendor.instagram.includes("instagram.com/")
                            ? vendor.instagram
                            : `https://www.instagram.com/${vendor.instagram.replace(/^@/, "")}`,
                        ) || undefined
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                    >
                      <Instagram size={14} /> Instagram
                    </a>
                  ) : null}
                  {vendor.website && externalUrl(vendor.website) ? (
                    <a
                      href={externalUrl(vendor.website)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                    >
                      <ExternalLink size={14} /> Sitio web
                    </a>
                  ) : null}
                </div>
                {vendor.notes ? (
                  <p className="mt-4 rounded-xl bg-[var(--cream)] p-3 break-words whitespace-pre-line text-xs leading-5 text-[var(--muted)]">
                    {vendor.notes}
                  </p>
                ) : null}
                <div className="mt-auto pt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--muted)]">Archivos ({docs.length})</span>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--moss)] hover:underline">
                      <FileUp size={14} /> {uploading === vendor.id ? "Subiendo..." : "Adjuntar archivo"}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        disabled={uploading !== null || saving}
                        onChange={(e) => {
                          void upload(vendor, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {docs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => openDocument(doc)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg bg-[var(--cream-2)] px-2.5 py-2 text-left text-xs hover:brightness-95"
                      >
                        <span className="min-w-0 truncate">{doc.filename || doc.title}</span>
                        <ExternalLink size={13} className="shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Store}
          title={vendors.length ? "Sin coincidencias" : "Armemos nuestro equipo"}
          description={
            vendors.length
              ? "Probá otro nombre o limpiá los filtros."
              : "Agregá salón, fotografía, música, flores y todos los contactos para nuestra celebración."
          }
          action={
            <Button disabled={saving || uploading !== null} onClick={openNew}>
              <Plus size={16} /> Agregar proveedor
            </Button>
          }
        />
      )}

      <Link href="/documentacion" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--moss)]">
        Ver checklist de documentación <ExternalLink size={15} />
      </Link>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editing ? "Editar proveedor" : "Nuevo proveedor"}
        size="lg"
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
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Categoría">
                <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {VENDOR_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Contacto">
                <Input
                  value={draft.contact_name}
                  onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })}
                />
              </Field>
              <Field label="Estado">
                <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="contacted">Contactado</option>
                  <option value="quoted">Cotizado</option>
                  <option value="booked">Contratado</option>
                  <option value="paid">Pagado</option>
                  <option value="cancelled">Cancelado</option>
                </Select>
              </Field>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Teléfono">
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Instagram">
                <Input
                  value={draft.instagram}
                  onChange={(e) => setDraft({ ...draft, instagram: e.target.value })}
                  placeholder="@usuario"
                />
              </Field>
              <Field label="Web">
                <Input
                  value={draft.website}
                  onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
            </div>
            <Field label="Dirección">
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
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
