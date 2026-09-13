"use client";

import { CheckCircle2, CircleDollarSign, CreditCard, Loader2, Pencil, Plus, ReceiptText, Trash2, WalletCards } from "lucide-react";
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
import { BUDGET_CATEGORIES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { BudgetItem, Payment, Vendor } from "@/lib/types";
import { currency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const blankItem = { concept: "", category: "Salón", vendor_id: "", estimated_amount: "", final_amount: "", status: "planned", notes: "" };
const blankPayment = { concept: "", vendor_id: "", budget_item_id: "", amount: "", due_date: "", payment_method: "", notes: "" };

export default function BudgetPage() {
  const { wedding } = useWedding();
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [itemModal, setItemModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [itemDraft, setItemDraft] = useState(blankItem);
  const [paymentDraft, setPaymentDraft] = useState(blankPayment);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [itemRes, paymentRes, vendorRes] = await Promise.all([
      supabase.from("budget_items").select("*").eq("wedding_id", wedding.id).order("category").order("concept"),
      supabase.from("payments").select("*").eq("wedding_id", wedding.id).order("due_date"),
      supabase.from("vendors").select("*").eq("wedding_id", wedding.id).order("name"),
    ]);
    setItems((itemRes.data || []) as BudgetItem[]);
    setPayments((paymentRes.data || []) as Payment[]);
    setVendors((vendorRes.data || []) as Vendor[]);
  }

  useEffect(() => { load(); }, [wedding.id]);

  const vendorNames = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor.name])), [vendors]);
  const itemNames = useMemo(() => new Map(items.map((item) => [item.id, item.concept])), [items]);
  const committed = items.reduce((sum, item) => sum + (item.final_amount ?? item.estimated_amount ?? 0), 0);
  const paid = payments.filter((p) => p.paid).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const pendingAmount = payments.filter((p) => !p.paid).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const pendingWithoutAmount = payments.filter((p) => !p.paid && p.amount == null).length;

  function openNewItem() { setEditingItem(null); setItemDraft(blankItem); setItemModal(true); }
  function openItem(item: BudgetItem) {
    setEditingItem(item);
    setItemDraft({ concept: item.concept, category: item.category, vendor_id: item.vendor_id || "", estimated_amount: item.estimated_amount?.toString() || "", final_amount: item.final_amount?.toString() || "", status: item.status, notes: item.notes || "" });
    setItemModal(true);
  }
  function openNewPayment() { setEditingPayment(null); setPaymentDraft(blankPayment); setPaymentModal(true); }
  function openPayment(payment: Payment) {
    setEditingPayment(payment);
    setPaymentDraft({ concept: payment.concept, vendor_id: payment.vendor_id || "", budget_item_id: payment.budget_item_id || "", amount: payment.amount?.toString() || "", due_date: payment.due_date, payment_method: payment.payment_method || "", notes: payment.notes || "" });
    setPaymentModal(true);
  }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const supabase = createClient();
    const payload = { wedding_id: wedding.id, concept: itemDraft.concept.trim(), category: itemDraft.category, vendor_id: itemDraft.vendor_id || null, estimated_amount: itemDraft.estimated_amount ? Number(itemDraft.estimated_amount) : null, final_amount: itemDraft.final_amount ? Number(itemDraft.final_amount) : null, status: itemDraft.status, notes: itemDraft.notes.trim() || null };
    if (editingItem) await supabase.from("budget_items").update(payload).eq("id", editingItem.id); else await supabase.from("budget_items").insert(payload);
    setSaving(false); setItemModal(false); await load();
  }

  async function savePayment(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const supabase = createClient();
    const payload = { wedding_id: wedding.id, concept: paymentDraft.concept.trim(), vendor_id: paymentDraft.vendor_id || null, budget_item_id: paymentDraft.budget_item_id || null, amount: paymentDraft.amount ? Number(paymentDraft.amount) : null, due_date: paymentDraft.due_date, payment_method: paymentDraft.payment_method.trim() || null, notes: paymentDraft.notes.trim() || null };
    if (editingPayment) await supabase.from("payments").update(payload).eq("id", editingPayment.id); else await supabase.from("payments").insert(payload);
    setSaving(false); setPaymentModal(false); await load();
  }

  async function togglePaid(payment: Payment) {
    const supabase = createClient();
    await supabase.from("payments").update({ paid: !payment.paid, paid_at: !payment.paid ? new Date().toISOString() : null }).eq("id", payment.id);
    await load();
  }

  async function removeItem() {
    if (!editingItem || !confirm(`¿Eliminar “${editingItem.concept}”?`)) return;
    const supabase = createClient(); await supabase.from("budget_items").delete().eq("id", editingItem.id); setItemModal(false); await load();
  }
  async function removePayment() {
    if (!editingPayment || !confirm(`¿Eliminar “${editingPayment.concept}”?`)) return;
    const supabase = createClient(); await supabase.from("payments").delete().eq("id", editingPayment.id); setPaymentModal(false); await load();
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Control financiero" title="Presupuesto" description="Separá presupuesto por rubros y manejá cada vencimiento. Las cuotas mensuales del salón ya quedan precargadas con importe editable." actions={<><Button variant="secondary" onClick={openNewPayment}><CreditCard size={17} /> Nuevo pago</Button><Button onClick={openNewItem}><Plus size={17} /> Nuevo rubro</Button></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={WalletCards} label="Presupuesto objetivo" value={currency(wedding.budget_target)} detail="Editable en Configuración" />
        <StatCard icon={ReceiptText} label="Comprometido" value={currency(committed)} detail="Final; si no, estimado" />
        <StatCard icon={CheckCircle2} label="Pagado registrado" value={currency(paid)} detail={`${payments.filter((p) => p.paid).length} pagos marcados`} />
        <StatCard icon={CircleDollarSign} label="Próximos pagos" value={currency(pendingAmount)} detail={pendingWithoutAmount ? `${pendingWithoutAmount} vencimientos todavía sin importe` : "Todos con importe cargado"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] p-5"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--moss)]">Rubros</p><h2 className="mt-1 font-serif text-2xl">Presupuesto general</h2></div><Button size="sm" onClick={openNewItem}><Plus size={15} /> Agregar</Button></div>
          {items.length ? <div className="divide-y divide-[var(--line)]">{items.map((item) => (
            <button key={item.id} onClick={() => openItem(item)} className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-[var(--cream)]">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.concept}</span><StatusBadge tone="moss">{item.category}</StatusBadge></div><p className="mt-1 text-xs text-[var(--muted)]">{item.vendor_id ? vendorNames.get(item.vendor_id) || "Proveedor" : "Sin proveedor"} · {item.status === "planned" ? "Planificado" : item.status === "quoted" ? "Cotizado" : item.status === "confirmed" ? "Confirmado" : "Cerrado"}</p></div>
              <div className="shrink-0 text-right"><div className="font-semibold">{currency(item.final_amount ?? item.estimated_amount)}</div>{item.final_amount != null && item.estimated_amount != null ? <div className="text-xs text-[var(--muted)]">estimado {currency(item.estimated_amount)}</div> : null}</div>
            </button>
          ))}</div> : <div className="p-5"><EmptyState icon={WalletCards} title="Todavía no hay rubros" description="Agregá vestido, alianzas, salón y cualquier gasto para ver el presupuesto total." /></div>}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] p-5"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--burgundy)]">Vencimientos</p><h2 className="mt-1 font-serif text-2xl">Pagos</h2></div><Button variant="secondary" size="sm" onClick={openNewPayment}><Plus size={15} /> Agregar</Button></div>
          <div className="max-h-[650px] divide-y divide-[var(--line)] overflow-y-auto scrollbar-thin">
            {payments.map((payment) => (
              <div key={payment.id} className={`p-4 ${payment.paid ? "bg-emerald-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-3"><button className="min-w-0 flex-1 text-left" onClick={() => openPayment(payment)}><div className="flex flex-wrap items-center gap-2"><span className={`font-medium ${payment.paid ? "text-[var(--muted)] line-through" : ""}`}>{payment.concept}</span>{payment.paid ? <StatusBadge tone="success">Pagado</StatusBadge> : null}</div><div className="mt-1 text-xs text-[var(--muted)]">{format(parseISO(payment.due_date), "d MMM yyyy", { locale: es })}{payment.vendor_id ? ` · ${vendorNames.get(payment.vendor_id) || "Proveedor"}` : ""}{payment.budget_item_id ? ` · ${itemNames.get(payment.budget_item_id) || "Rubro"}` : ""}</div></button><div className="text-right"><div className="text-sm font-semibold">{currency(payment.amount)}</div><button onClick={() => togglePaid(payment)} className="mt-2 text-xs font-semibold text-[var(--moss)] hover:underline">{payment.paid ? "Marcar pendiente" : "Marcar pagado"}</button></div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={itemModal} onClose={() => setItemModal(false)} title={editingItem ? "Editar rubro" : "Nuevo rubro de presupuesto"}>
        <form onSubmit={saveItem} className="grid gap-4"><Field label="Concepto"><Input required value={itemDraft.concept} onChange={(e) => setItemDraft({ ...itemDraft, concept: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Categoría"><Select value={itemDraft.category} onChange={(e) => setItemDraft({ ...itemDraft, category: e.target.value })}>{BUDGET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field><Field label="Proveedor"><Select value={itemDraft.vendor_id} onChange={(e) => setItemDraft({ ...itemDraft, vendor_id: e.target.value })}><option value="">Sin proveedor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Estimado (ARS)"><Input type="number" min="0" step="0.01" value={itemDraft.estimated_amount} onChange={(e) => setItemDraft({ ...itemDraft, estimated_amount: e.target.value })} /></Field><Field label="Final (ARS)"><Input type="number" min="0" step="0.01" value={itemDraft.final_amount} onChange={(e) => setItemDraft({ ...itemDraft, final_amount: e.target.value })} /></Field></div><Field label="Estado"><Select value={itemDraft.status} onChange={(e) => setItemDraft({ ...itemDraft, status: e.target.value })}><option value="planned">Planificado</option><option value="quoted">Cotizado</option><option value="confirmed">Confirmado</option><option value="closed">Cerrado</option></Select></Field><Field label="Notas"><Textarea value={itemDraft.notes} onChange={(e) => setItemDraft({ ...itemDraft, notes: e.target.value })} /></Field><div className="flex justify-between"><div>{editingItem ? <Button type="button" variant="danger" onClick={removeItem}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setItemModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : editingItem ? <Pencil size={15} /> : null} Guardar</Button></div></div></form>
      </Modal>

      <Modal open={paymentModal} onClose={() => setPaymentModal(false)} title={editingPayment ? "Editar pago" : "Nuevo pago"}>
        <form onSubmit={savePayment} className="grid gap-4"><Field label="Concepto"><Input required value={paymentDraft.concept} onChange={(e) => setPaymentDraft({ ...paymentDraft, concept: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Proveedor"><Select value={paymentDraft.vendor_id} onChange={(e) => setPaymentDraft({ ...paymentDraft, vendor_id: e.target.value })}><option value="">Sin proveedor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field><Field label="Rubro"><Select value={paymentDraft.budget_item_id} onChange={(e) => setPaymentDraft({ ...paymentDraft, budget_item_id: e.target.value })}><option value="">Sin rubro</option>{items.map((i) => <option key={i.id} value={i.id}>{i.concept}</option>)}</Select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Importe (ARS)"><Input type="number" min="0" step="0.01" value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} placeholder="Puede quedar vacío" /></Field><Field label="Vencimiento"><Input required type="date" value={paymentDraft.due_date} onChange={(e) => setPaymentDraft({ ...paymentDraft, due_date: e.target.value })} /></Field></div><Field label="Medio de pago"><Input value={paymentDraft.payment_method} onChange={(e) => setPaymentDraft({ ...paymentDraft, payment_method: e.target.value })} placeholder="Transferencia, efectivo..." /></Field><Field label="Notas"><Textarea value={paymentDraft.notes} onChange={(e) => setPaymentDraft({ ...paymentDraft, notes: e.target.value })} /></Field><div className="flex justify-between"><div>{editingPayment ? <Button type="button" variant="danger" onClick={removePayment}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setPaymentModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null} Guardar</Button></div></div></form>
      </Modal>
    </div>
  );
}
