"use client";

import { CheckCircle2, ClipboardList, ExternalLink, FileCheck2, FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
import { StatCard } from "@/components/planner/stat-card";
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

const blank = { category: "Civil", title: "", status: "missing", due_date: "", notes: "", source_url: "" };

export default function DocumentsPage() {
  const { wedding } = useWedding();
  const [documents, setDocuments] = useState<WeddingDocument[]>([]);
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WeddingDocument | null>(null);
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("documents").select("*").eq("wedding_id", wedding.id).is("vendor_id", null).order("category").order("due_date", { ascending: true, nullsFirst: false });
    setDocuments((data || []) as WeddingDocument[]);
  }

  useEffect(() => { load(); }, [wedding.id]);
  const visible = useMemo(() => filter === "all" ? documents : documents.filter((doc) => doc.category === filter), [documents, filter]);
  const ready = documents.filter((d) => d.status === "ready" || d.status === "delivered").length;

  function openNew() { setEditing(null); setDraft(blank); setModalOpen(true); }
  function openEdit(doc: WeddingDocument) { setEditing(doc); setDraft({ category: doc.category, title: doc.title, status: doc.status, due_date: doc.due_date || "", notes: doc.notes || "", source_url: doc.source_url || "" }); setModalOpen(true); }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const supabase = createClient();
    const payload = { wedding_id: wedding.id, category: draft.category, title: draft.title.trim(), status: draft.status, due_date: draft.due_date || null, notes: draft.notes.trim() || null, source_url: draft.source_url.trim() || null };
    if (editing) await supabase.from("documents").update(payload).eq("id", editing.id); else await supabase.from("documents").insert(payload);
    setSaving(false); setModalOpen(false); await load();
  }

  async function updateStatus(doc: WeddingDocument, status: WeddingDocument["status"]) {
    const supabase = createClient(); await supabase.from("documents").update({ status }).eq("id", doc.id); await load();
  }

  async function upload(doc: WeddingDocument, file?: File) {
    if (!file) return; setUploading(doc.id); const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${wedding.id}/documents/${doc.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("wedding-documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (uploadError) { alert(uploadError.message); setUploading(null); return; }
    const { error } = await supabase.from("documents").update({ storage_path: path, filename: file.name, mime_type: file.type || null, status: "ready" }).eq("id", doc.id);
    if (error) alert(error.message);
    setUploading(null); await load();
  }

  async function viewFile(doc: WeddingDocument) {
    if (!doc.storage_path) return;
    const supabase = createClient(); const { data, error } = await supabase.storage.from("wedding-documents").createSignedUrl(doc.storage_path, 120);
    if (error) { alert(error.message); return; } window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove() {
    if (!editing || !confirm(`¿Eliminar “${editing.title}”?`)) return;
    const supabase = createClient();
    if (editing.storage_path) await supabase.storage.from("wedding-documents").remove([editing.storage_path]);
    await supabase.from("documents").delete().eq("id", editing.id); setModalOpen(false); await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Civil · Iglesia · Contratos" title="Documentación" description="Checklist documental con estado, vencimiento, notas y archivo adjunto. Los requisitos iniciales del civil están basados en la información oficial de Provincia de Buenos Aires; los de iglesia quedan marcados para validar con la secretaría parroquial." actions={<Button onClick={openNew}><Plus size={17} /> Agregar documento</Button>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} label="Documentos" value={documents.length} detail="Checklist total" />
        <StatCard icon={FileCheck2} label="Listos" value={ready} detail="Listos o entregados" />
        <StatCard icon={CheckCircle2} label="Progreso" value={documents.length ? `${Math.round((ready / documents.length) * 100)}%` : "0%"} detail="Preparación documental" />
      </div>

      <Card className="p-3"><div className="flex flex-wrap gap-2">{["all", "Civil", "Iglesia", "General"].map((item) => <Button key={item} size="sm" variant={filter === item ? "primary" : "secondary"} onClick={() => setFilter(item)}>{item === "all" ? "Todos" : item}</Button>)}</div></Card>

      {visible.length ? <div className="grid gap-3">{visible.map((doc) => (
        <Card key={doc.id} className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={doc.category === "Civil" ? "moss" : doc.category === "Iglesia" ? "burgundy" : "neutral"}>{doc.category}</StatusBadge><StatusBadge tone={doc.status === "delivered" || doc.status === "ready" ? "success" : doc.status === "pending" ? "warning" : "danger"}>{doc.status === "missing" ? "Falta" : doc.status === "pending" ? "En trámite" : doc.status === "ready" ? "Listo" : "Entregado"}</StatusBadge></div>
              <h3 className="mt-2 font-medium">{doc.title}</h3>
              {doc.notes ? <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{doc.notes}</p> : null}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">{doc.due_date ? <span>Fecha objetivo: {format(parseISO(doc.due_date), "d MMM yyyy", { locale: es })}</span> : null}{doc.filename ? <button onClick={() => viewFile(doc)} className="inline-flex items-center gap-1 font-semibold text-[var(--moss)] hover:underline"><ExternalLink size={12} /> {doc.filename}</button> : null}{doc.source_url ? <a href={doc.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--moss)] hover:underline"><ExternalLink size={12} /> Fuente / referencia</a> : null}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2"><Select className="w-36" value={doc.status} onChange={(e) => updateStatus(doc, e.target.value as WeddingDocument["status"])}><option value="missing">Falta</option><option value="pending">En trámite</option><option value="ready">Listo</option><option value="delivered">Entregado</option></Select><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-medium hover:bg-[var(--cream-2)]"><FileUp size={15} /> {uploading === doc.id ? "Subiendo..." : doc.storage_path ? "Reemplazar" : "Adjuntar"}<input className="hidden" type="file" disabled={uploading === doc.id} onChange={(e) => upload(doc, e.target.files?.[0])} /></label><Button variant="ghost" size="sm" onClick={() => openEdit(doc)}><Pencil size={15} /></Button></div>
          </div>
        </Card>
      ))}</div> : <EmptyState icon={ClipboardList} title="No hay documentos" description="Agregá requisitos, partidas, contratos y cualquier archivo que quieran controlar." />}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar documento" : "Nuevo documento"}>
        <form onSubmit={save} className="grid gap-4"><Field label="Título"><Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Categoría"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option>Civil</option><option>Iglesia</option><option>General</option></Select></Field><Field label="Estado"><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="missing">Falta</option><option value="pending">En trámite</option><option value="ready">Listo</option><option value="delivered">Entregado</option></Select></Field></div><Field label="Fecha objetivo"><Input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field><Field label="Fuente / URL"><Input type="url" value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} /></Field><Field label="Notas"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field><div className="flex justify-between"><div>{editing ? <Button type="button" variant="danger" onClick={remove}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null} Guardar</Button></div></div></form>
      </Modal>
    </div>
  );
}
