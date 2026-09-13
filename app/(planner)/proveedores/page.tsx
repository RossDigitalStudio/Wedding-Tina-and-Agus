"use client";

import { ExternalLink, FileUp, Loader2, Mail, MapPin, Pencil, Phone, Plus, Store, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

const blank = { category: "Otros", name: "", contact_name: "", phone: "", email: "", instagram: "", website: "", address: "", status: "contacted", notes: "" };

export default function VendorsPage() {
  const { wedding } = useWedding();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [documents, setDocuments] = useState<WeddingDocument[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [vendorRes, documentRes] = await Promise.all([
      supabase.from("vendors").select("*").eq("wedding_id", wedding.id).order("category").order("name"),
      supabase.from("documents").select("*").eq("wedding_id", wedding.id).not("vendor_id", "is", null).order("created_at", { ascending: false }),
    ]);
    setVendors((vendorRes.data || []) as Vendor[]);
    setDocuments((documentRes.data || []) as WeddingDocument[]);
  }

  useEffect(() => { load(); }, [wedding.id]);
  const docsByVendor = useMemo(() => {
    const map = new Map<string, WeddingDocument[]>();
    documents.forEach((doc) => doc.vendor_id && map.set(doc.vendor_id, [...(map.get(doc.vendor_id) || []), doc]));
    return map;
  }, [documents]);

  function openNew() { setEditing(null); setDraft(blank); setModalOpen(true); }
  function openEdit(vendor: Vendor) {
    setEditing(vendor);
    setDraft({ category: vendor.category, name: vendor.name, contact_name: vendor.contact_name || "", phone: vendor.phone || "", email: vendor.email || "", instagram: vendor.instagram || "", website: vendor.website || "", address: vendor.address || "", status: vendor.status, notes: vendor.notes || "" });
    setModalOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const supabase = createClient();
    const payload = { wedding_id: wedding.id, category: draft.category, name: draft.name.trim(), contact_name: draft.contact_name.trim() || null, phone: draft.phone.trim() || null, email: draft.email.trim() || null, instagram: draft.instagram.trim() || null, website: draft.website.trim() || null, address: draft.address.trim() || null, status: draft.status, notes: draft.notes.trim() || null };
    if (editing) await supabase.from("vendors").update(payload).eq("id", editing.id); else await supabase.from("vendors").insert(payload);
    setSaving(false); setModalOpen(false); await load();
  }

  async function remove() {
    if (!editing || !confirm(`¿Eliminar proveedor “${editing.name}”?`)) return;
    const supabase = createClient(); await supabase.from("vendors").delete().eq("id", editing.id); setModalOpen(false); await load();
  }

  async function upload(vendor: Vendor, file?: File) {
    if (!file) return;
    setUploading(vendor.id);
    const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${wedding.id}/vendors/${vendor.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("wedding-documents").upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
    if (uploadError) { alert(uploadError.message); setUploading(null); return; }
    const { error } = await supabase.from("documents").insert({ wedding_id: wedding.id, vendor_id: vendor.id, category: "Proveedor", title: file.name, status: "ready", storage_path: path, filename: file.name, mime_type: file.type || null });
    if (error) alert(error.message);
    setUploading(null); await load();
  }

  async function openDocument(doc: WeddingDocument) {
    if (!doc.storage_path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("wedding-documents").createSignedUrl(doc.storage_path, 120);
    if (error) { alert(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Contactos, contratos y notas" title="Proveedores" description="Centralizá todo lo contratado o cotizado. Podés adjuntar contratos, presupuestos y comprobantes en PDF de forma privada." actions={<Button onClick={openNew}><Plus size={17} /> Nuevo proveedor</Button>} />

      {vendors.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vendors.map((vendor) => {
        const docs = docsByVendor.get(vendor.id) || [];
        return (
          <Card key={vendor.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3"><div><StatusBadge tone={vendor.status === "booked" || vendor.status === "paid" ? "success" : vendor.status === "quoted" ? "warning" : "neutral"}>{vendor.status === "contacted" ? "Contactado" : vendor.status === "quoted" ? "Cotizado" : vendor.status === "booked" ? "Contratado" : vendor.status === "paid" ? "Pagado" : "Cancelado"}</StatusBadge><h2 className="mt-3 font-serif text-2xl">{vendor.name}</h2><p className="mt-1 text-xs font-semibold uppercase tracking-[.1em] text-[var(--moss)]">{vendor.category}</p></div><Button variant="ghost" size="sm" onClick={() => openEdit(vendor)}><Pencil size={16} /></Button></div>
            <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">{vendor.contact_name ? <p>{vendor.contact_name}</p> : null}{vendor.phone ? <p className="flex items-center gap-2"><Phone size={14} /> {vendor.phone}</p> : null}{vendor.email ? <p className="flex items-center gap-2"><Mail size={14} /> {vendor.email}</p> : null}{vendor.address ? <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" /> {vendor.address}</p> : null}</div>
            {vendor.notes ? <p className="mt-4 rounded-xl bg-[var(--cream)] p-3 text-xs leading-5 text-[var(--muted)]">{vendor.notes}</p> : null}
            <div className="mt-auto pt-5">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-[var(--muted)]">Archivos ({docs.length})</span><label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--moss)] hover:underline"><FileUp size={14} /> {uploading === vendor.id ? "Subiendo..." : "Adjuntar PDF"}<input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading === vendor.id} onChange={(e) => upload(vendor, e.target.files?.[0])} /></label></div>
              <div className="space-y-1">{docs.slice(0, 3).map((doc) => <button key={doc.id} onClick={() => openDocument(doc)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-[var(--cream-2)] px-2.5 py-2 text-left text-xs hover:brightness-95"><span className="truncate">{doc.filename || doc.title}</span><ExternalLink size={13} className="shrink-0" /></button>)}</div>
            </div>
          </Card>
        );
      })}</div> : <EmptyState icon={Store} title="No hay proveedores" description="El salón y la parroquia se crean automáticamente al inicializar la boda. También podés agregar vestido, traje, alianzas, flores y más." action={<Button onClick={openNew}><Plus size={16} /> Agregar proveedor</Button>} />}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar proveedor" : "Nuevo proveedor"} size="lg">
        <form onSubmit={save} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><Input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field><Field label="Categoría"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{VENDOR_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</Select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Contacto"><Input value={draft.contact_name} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} /></Field><Field label="Estado"><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="contacted">Contactado</option><option value="quoted">Cotizado</option><option value="booked">Contratado</option><option value="paid">Pagado</option><option value="cancelled">Cancelado</option></Select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Teléfono"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field><Field label="Email"><Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Instagram"><Input value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })} placeholder="@usuario" /></Field><Field label="Web"><Input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://..." /></Field></div><Field label="Dirección"><Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field><Field label="Notas"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field><div className="flex justify-between"><div>{editing ? <Button type="button" variant="danger" onClick={remove}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null} Guardar</Button></div></div></form>
      </Modal>
    </div>
  );
}
