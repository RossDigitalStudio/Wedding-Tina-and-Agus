"use client";

import { CheckCircle2, CircleDollarSign, CreditCard, Loader2, Pencil, Plus, ReceiptText, Trash2, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/planner/page-header";
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
import { differenceInCalendarDays, format, parseISO } from "date-fns";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [itemRes, paymentRes, vendorRes] = await Promise.all([
        supabase.from("budget_items").select("*").eq("wedding_id", wedding.id).order("category").order("concept"),
        supabase.from("payments").select("*").eq("wedding_id", wedding.id).order("due_date"),
        supabase.from("vendors").select("*").eq("wedding_id", wedding.id).order("name"),
      ]);
      if ([itemRes, paymentRes, vendorRes].some((result) => result.error)) throw new Error("load");
      setItems((itemRes.data || []) as BudgetItem[]); setPayments((paymentRes.data || []) as Payment[]); setVendors((vendorRes.data || []) as Vendor[]); setError("");
    } catch { setError("No pudimos actualizar el presupuesto. Intentá nuevamente."); }
    finally { setLoading(false); }
  }, [wedding.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const vendorNames = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor.name])), [vendors]);
  const itemNames = useMemo(() => new Map(items.map((item) => [item.id, item.concept])), [items]);
  const committed = items.reduce((sum, item) => sum + (item.final_amount ?? item.estimated_amount ?? 0), 0);
  const paid = payments.filter((p) => p.paid).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const pendingAmount = payments.filter((p) => !p.paid).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const pendingWithoutAmount = payments.filter((p) => !p.paid && p.amount == null).length;

  function openNewItem() { setFormError(""); setEditingItem(null); setItemDraft(blankItem); setItemModal(true); }
  function openItem(item: BudgetItem) {
    setFormError("");
    setEditingItem(item);
    setItemDraft({ concept: item.concept, category: item.category, vendor_id: item.vendor_id || "", estimated_amount: item.estimated_amount?.toString() || "", final_amount: item.final_amount?.toString() || "", status: item.status, notes: item.notes || "" });
    setItemModal(true);
  }
  function openNewPayment() { setFormError(""); setEditingPayment(null); setPaymentDraft(blankPayment); setPaymentModal(true); }
  function openPayment(payment: Payment) {
    setFormError("");
    setEditingPayment(payment);
    setPaymentDraft({ concept: payment.concept, vendor_id: payment.vendor_id || "", budget_item_id: payment.budget_item_id || "", amount: payment.amount?.toString() || "", due_date: payment.due_date, payment_method: payment.payment_method || "", notes: payment.notes || "" });
    setPaymentModal(true);
  }

  async function mutate(operation: () => PromiseLike<{ error: unknown }>, message: string, close?: () => void) {
    if (saving) return;
    setSaving(true); setFormError(""); setNotice("");
    try {
      const result = await operation();
      if (result.error) throw result.error;
      close?.(); setNotice(message); await load();
    } catch {
      if (itemModal || paymentModal) setFormError("No pudimos guardar el cambio. Tus datos siguen acá; intentá nuevamente.");
      else setError("No pudimos registrar el cambio. Intentá nuevamente.");
    } finally { setSaving(false); }
  }

  function validAmount(value: string) { return value.trim() === "" || (Number.isFinite(Number(value)) && Number(value) >= 0); }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault();
    if (!itemDraft.concept.trim()) { setFormError("Escribí un concepto para el rubro."); return; }
    if (!validAmount(itemDraft.estimated_amount) || !validAmount(itemDraft.final_amount)) { setFormError("Los importes deben ser números iguales o mayores a cero."); return; }
    const supabase = createClient();
    const payload = { wedding_id: wedding.id, concept: itemDraft.concept.trim(), category: itemDraft.category, vendor_id: itemDraft.vendor_id || null, estimated_amount: itemDraft.estimated_amount ? Number(itemDraft.estimated_amount) : null, final_amount: itemDraft.final_amount ? Number(itemDraft.final_amount) : null, status: itemDraft.status, notes: itemDraft.notes.trim() || null };
    await mutate(() => editingItem ? supabase.from("budget_items").update(payload).eq("id", editingItem.id).eq("wedding_id", wedding.id).select("id").single() : supabase.from("budget_items").insert(payload).select("id").single(), editingItem ? "Rubro actualizado." : "Rubro agregado.", () => { setItemModal(false); setQuery(""); setCategory("all"); });
  }

  async function savePayment(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentDraft.concept.trim()) { setFormError("Escribí un concepto para el pago."); return; }
    if (!validAmount(paymentDraft.amount)) { setFormError("El importe debe ser un número igual o mayor a cero."); return; }
    if (editingPayment?.paid && !paymentDraft.amount.trim()) { setFormError("Un pago registrado necesita un importe. Si todavía no lo conocés, primero marcalo como pendiente."); return; }
    const supabase = createClient();
    const payload = { wedding_id: wedding.id, concept: paymentDraft.concept.trim(), vendor_id: paymentDraft.vendor_id || null, budget_item_id: paymentDraft.budget_item_id || null, amount: paymentDraft.amount ? Number(paymentDraft.amount) : null, due_date: paymentDraft.due_date, payment_method: paymentDraft.payment_method.trim() || null, notes: paymentDraft.notes.trim() || null };
    await mutate(() => editingPayment ? supabase.from("payments").update(payload).eq("id", editingPayment.id).eq("wedding_id", wedding.id).select("id").single() : supabase.from("payments").insert(payload).select("id").single(), editingPayment ? "Pago actualizado." : "Pago agregado.", () => { setPaymentModal(false); setQuery(""); setPaymentFilter(editingPayment?.paid ? "paid" : "open"); });
  }

  async function togglePaid(payment: Payment) {
    if (!payment.paid && payment.amount == null) { openPayment(payment); setFormError("Cargá el importe antes de registrar este pago como pagado."); return; }
    const supabase = createClient();
    await mutate(() => supabase.from("payments").update({ paid: !payment.paid, paid_at: !payment.paid ? new Date().toISOString() : null }).eq("id", payment.id).eq("wedding_id", wedding.id).select("id").single(), payment.paid ? "Pago marcado como pendiente." : "Pago registrado como pagado.");
  }

  async function removeItem() {
    if (!editingItem || saving || !confirm(`¿Eliminar “${editingItem.concept}”?`)) return;
    const supabase = createClient();
    await mutate(() => supabase.from("budget_items").delete().eq("id", editingItem.id).eq("wedding_id", wedding.id).select("id").single(), "Rubro eliminado.", () => setItemModal(false));
  }
  async function removePayment() {
    if (!editingPayment || saving || !confirm(`¿Eliminar “${editingPayment.concept}”?`)) return;
    const supabase = createClient();
    await mutate(() => supabase.from("payments").delete().eq("id", editingPayment.id).eq("wedding_id", wedding.id).select("id").single(), "Pago eliminado.", () => setPaymentModal(false));
  }

  const overdue = (payment: Payment) => !payment.paid && differenceInCalendarDays(parseISO(payment.due_date), new Date()) < 0;
  const overduePayments = payments.filter(overdue);
  const withoutItemAmount = items.filter((item) => item.final_amount == null && item.estimated_amount == null).length;
  const paidWithoutAmount = payments.filter((payment) => payment.paid && payment.amount == null).length;
  const target = wedding.budget_target;
  const paidProgress = committed > 0 ? Math.round(paid / committed * 100) : 0;
  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const visibleItems = items.filter((item) => (category === "all" || item.category === category) && match(`${item.concept} ${item.category} ${item.vendor_id ? vendorNames.get(item.vendor_id) || "" : ""}`));
  const visiblePayments = payments.filter((payment) => (paymentFilter === "all" || paymentFilter === "open" && !payment.paid || paymentFilter === "paid" && payment.paid || paymentFilter === "overdue" && overdue(payment)) && match(`${payment.concept} ${payment.vendor_id ? vendorNames.get(payment.vendor_id) || "" : ""} ${payment.budget_item_id ? itemNames.get(payment.budget_item_id) || "" : ""}`));
  const paymentGroups = [{ key: "overdue", label: "Fechas vencidas" }, { key: "soon", label: "Próximos 7 días" }, { key: "later", label: "Más adelante" }, { key: "paid", label: "Pagos registrados" }];
  function paymentGroup(payment: Payment) { return payment.paid ? "paid" : overdue(payment) ? "overdue" : differenceInCalendarDays(parseISO(payment.due_date), new Date()) < 7 ? "soon" : "later"; }
  const categories = Array.from(new Set([...BUDGET_CATEGORIES, ...items.map((item) => item.category)]));

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader eyebrow="Cada detalle, también en las cuentas" title="Presupuesto" description="Nuestros gastos, pagos y próximas fechas, con todo a la vista." actions={<><Button className="min-h-11" variant="secondary" disabled={saving} onClick={openNewPayment}><CreditCard size={17} /> Nuevo pago</Button><Button className="min-h-11" disabled={saving} onClick={openNewItem}><Plus size={17} /> Nuevo rubro</Button></>} />
      <Card className="min-w-0 overflow-hidden border-[var(--moss-dark)] bg-[var(--ink)] p-5 text-white sm:p-6">
        <p className="text-xs text-[#c7d1b7]">Nuestro presupuesto objetivo</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><h2 className="break-words font-serif text-3xl">{currency(target)}</h2><a href="/configuracion" className="inline-flex min-h-11 items-center gap-1 text-xs text-[#c7d1b7]"><Pencil size={13} /> Ajustar objetivo</a></div>
        <p className="mt-2 text-xs leading-5 text-white/75">{loading || error ? "Actualizando nuestras cuentas…" : target == null ? "Podemos definir un objetivo desde Configuración." : committed > target ? `El total previsto supera el objetivo en ${currency(committed - target)}.` : `Quedan ${currency(target - committed)} entre el total previsto y nuestro objetivo.`}</p>
        <div className="mt-4 border-t border-white/15 pt-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-white/75"><span>Pagado frente al total previsto</span><span>{loading || error ? "—" : committed > 0 ? `${paidProgress}%` : "Sin total previsto"}</span></div><div role="progressbar" aria-label="Pagado frente al total previsto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading || error || committed === 0 ? undefined : Math.min(100, paidProgress)} className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#c7d1b7]" style={{ width: `${loading || error ? 0 : Math.min(100, paidProgress)}%` }} /></div></div>
      </Card>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
        {[{ icon: ReceiptText, label: "Total previsto", value: committed, detail: withoutItemAmount ? `${withoutItemAmount} ${withoutItemAmount === 1 ? "rubro" : "rubros"} todavía sin importe` : "Importe final o estimado de cada rubro" }, { icon: CheckCircle2, label: "Pagado registrado", value: paid, detail: paidWithoutAmount ? `${paidWithoutAmount} ${paidWithoutAmount === 1 ? "pago registrado" : "pagos registrados"} sin importe` : `${payments.filter((payment) => payment.paid).length} pagos registrados` }, { icon: CircleDollarSign, label: "Pagos pendientes", value: pendingAmount, detail: pendingWithoutAmount ? `${pendingWithoutAmount} ${pendingWithoutAmount === 1 ? "vencimiento" : "vencimientos"} sin importe, fuera de este total` : "Suma de los vencimientos pendientes" }].map(({ icon: Icon, label, value, detail }, index) => <Card key={label} className={`min-w-0 p-4 ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`}><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Icon size={17} className="shrink-0 text-[var(--moss)]" />{label}</div><p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{loading || error ? "—" : currency(value)}</p><p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{loading || error ? "Actualizando…" : detail}</p></Card>)}
      </div>
      {notice ? <p role="status" className="rounded-xl bg-[var(--moss-soft)] p-3 text-sm text-[var(--moss-dark)]">{notice}</p> : null}
      {error ? <div role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-4 text-sm text-[var(--burgundy)]">{error}<Button className="mt-2" disabled={loading} variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : null}
      {!loading && !error && overduePayments.length > 0 ? <button disabled={saving} onClick={() => { setPaymentFilter("overdue"); setQuery(""); document.getElementById("payment-list")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--burgundy)]/25 bg-[var(--burgundy-soft)] p-4 text-left text-[var(--burgundy)]"><span style={{ fontSize: "14px" }}>{overduePayments.length} {overduePayments.length === 1 ? "pago tiene" : "pagos tienen"} la fecha vencida</span><span style={{ fontSize: "12px" }} className="font-semibold">Revisar pagos</span></button> : null}
      <Input aria-label="Buscar rubro o pago" className="min-w-0 w-full" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rubro, pago o proveedor…" />
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]"><Loader2 size={18} className="animate-spin" /> Actualizando nuestras cuentas…</div> : error ? null : <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <Card className="order-2 min-w-0 overflow-hidden xl:order-1">
          <div className="border-b border-[var(--line)] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--moss)]">Nuestros gastos</p><h2 className="mt-1 font-serif text-2xl">Rubros del casamiento</h2></div><Button className="min-h-11" disabled={saving} size="sm" onClick={openNewItem}><Plus size={15} /> Agregar</Button></div><Select aria-label="Filtrar rubros por categoría" className="mt-3 min-w-0 w-full" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas las categorías</option>{categories.map((value) => <option key={value}>{value}</option>)}</Select></div>
          {visibleItems.length ? <div className="divide-y divide-[var(--line)]">{visibleItems.map((item) => <button key={item.id} disabled={saving} onClick={() => openItem(item)} className="block w-full min-w-0 p-4 text-left transition hover:bg-[var(--cream)]">
            <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{item.concept}</span><StatusBadge tone="moss">{item.category}</StatusBadge></div><p style={{ fontSize: "12px" }} className="mt-2 break-words text-[var(--muted)]">{item.vendor_id ? vendorNames.get(item.vendor_id) || "Proveedor" : "Sin proveedor"} · {item.status === "planned" ? "Planificado" : item.status === "quoted" ? "Cotizado" : item.status === "confirmed" ? "Confirmado" : "Cerrado"}</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2"><div><p style={{ fontSize: "10px" }} className="uppercase tracking-wide text-[var(--muted)]">{item.final_amount != null ? "Importe final" : "Estimado"}</p><p className="mt-1 break-words font-semibold">{currency(item.final_amount ?? item.estimated_amount)}</p>{item.final_amount != null && item.estimated_amount != null ? <p style={{ fontSize: "12px" }} className="mt-1 text-[var(--muted)]">Estimado: {currency(item.estimated_amount)}</p> : null}</div><span style={{ fontSize: "12px" }} className="inline-flex items-center gap-1 text-[var(--moss)]"><Pencil size={13} />Editar rubro</span></div>
          </button>)}</div> : <div className="p-5"><EmptyState icon={WalletCards} title={items.length ? "Sin rubros con este filtro" : "Empecemos a planificar los gastos"} description={items.length ? "Probá otra categoría o búsqueda." : "Agregá salón, vestido, alianzas y los detalles que queremos para ese día."} /></div>}
        </Card>
        <Card id="payment-list" className="order-1 min-w-0 scroll-mt-24 overflow-hidden xl:order-2">
          <div className="border-b border-[var(--line)] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--burgundy)]">Nuestra agenda de pagos</p><h2 className="mt-1 font-serif text-2xl">Vencimientos</h2></div><Button className="min-h-11" disabled={saving} variant="secondary" size="sm" onClick={openNewPayment}><Plus size={15} /> Agregar</Button></div>
            <Select aria-label="Filtrar pagos" className="mt-3 min-w-0 w-full" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="open">Pendientes ({payments.filter((payment) => !payment.paid).length})</option><option value="overdue">Vencidos ({overduePayments.length})</option><option value="paid">Pagados ({payments.filter((payment) => payment.paid).length})</option><option value="all">Todos los pagos</option></Select>
          </div>
          <div className="p-4">{visiblePayments.length ? paymentGroups.map((group) => {
            const groupPayments = visiblePayments.filter((payment) => paymentGroup(payment) === group.key);
            return groupPayments.length ? <section key={group.key} className="mb-5 last:mb-0"><h3 className={`mb-3 text-sm font-semibold ${group.key === "overdue" ? "text-[var(--burgundy)]" : "text-[var(--moss)]"}`}>{group.label} · {groupPayments.length}</h3><div className="space-y-3">{groupPayments.map((payment) => <div key={payment.id} className={`min-w-0 rounded-xl border p-3 ${payment.paid ? "border-[var(--moss)]/20 bg-[var(--moss-soft)]/40" : overdue(payment) ? "border-[var(--burgundy)]/25 bg-[var(--burgundy-soft)]/40" : "border-[var(--line)] bg-[var(--cream)]"}`}>
              <div className="flex flex-wrap items-center gap-2"><h4 className="break-words text-sm font-medium">{payment.concept}</h4>{payment.paid ? <StatusBadge tone="success">Pagado</StatusBadge> : payment.amount == null ? <StatusBadge tone="warning">Falta importe</StatusBadge> : null}</div>
              <p className={`mt-2 break-words text-xs ${overdue(payment) ? "font-semibold text-[var(--burgundy)]" : "text-[var(--muted)]"}`}>{overdue(payment) ? "Venció" : "Vencimiento"}: {format(parseISO(payment.due_date), "d MMM yyyy", { locale: es })}{payment.vendor_id ? ` · ${vendorNames.get(payment.vendor_id) || "Proveedor"}` : ""}</p>
              {payment.budget_item_id ? <p className="mt-1 break-words text-xs text-[var(--muted)]">Rubro: {itemNames.get(payment.budget_item_id) || "Rubro"}</p> : null}
              {payment.paid_at ? <p className="mt-1 text-xs text-[var(--moss)]">Pagado el {format(parseISO(payment.paid_at), "d MMM yyyy", { locale: es })}</p> : null}
              <p className="mt-3 break-words text-lg font-semibold">{currency(payment.amount)}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-11" variant={payment.paid ? "secondary" : "primary"} size="sm" disabled={saving} onClick={() => void togglePaid(payment)}>{payment.paid ? "Marcar pendiente" : payment.amount == null ? "Cargar importe" : "Marcar pagado"}</Button><Button className="min-h-11" variant="ghost" size="sm" disabled={saving} onClick={() => openPayment(payment)}><Pencil size={14} />Editar</Button></div>
            </div>)}</div></section> : null;
          }) : <EmptyState icon={CreditCard} title={payments.length ? "Sin pagos con este filtro" : "Nuestra agenda de pagos está vacía"} description={payments.length ? "Elegí otro estado o cambiá la búsqueda." : "Agregá una cuota o un vencimiento para tenerlo presente."} />}</div>
        </Card>
      </div>}

      <Modal open={itemModal} onClose={() => { if (!saving) setItemModal(false); }} title={editingItem ? "Editar rubro" : "Nuevo rubro de presupuesto"}>
        <form onSubmit={saveItem} className="grid min-w-0 gap-4">{formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}<fieldset disabled={saving} className="grid min-w-0 gap-4"><Field label="Concepto"><Input required value={itemDraft.concept} onChange={(e) => setItemDraft({ ...itemDraft, concept: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Categoría"><Select value={itemDraft.category} onChange={(e) => setItemDraft({ ...itemDraft, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</Select></Field><Field label="Proveedor"><Select value={itemDraft.vendor_id} onChange={(e) => setItemDraft({ ...itemDraft, vendor_id: e.target.value })}><option value="">Sin proveedor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Estimado (ARS)"><Input type="number" min="0" step="0.01" value={itemDraft.estimated_amount} onChange={(e) => setItemDraft({ ...itemDraft, estimated_amount: e.target.value })} /></Field><Field label="Final (ARS)"><Input type="number" min="0" step="0.01" value={itemDraft.final_amount} onChange={(e) => setItemDraft({ ...itemDraft, final_amount: e.target.value })} /></Field></div><Field label="Estado"><Select value={itemDraft.status} onChange={(e) => setItemDraft({ ...itemDraft, status: e.target.value })}><option value="planned">Planificado</option><option value="quoted">Cotizado</option><option value="confirmed">Confirmado</option><option value="closed">Cerrado</option></Select></Field><Field label="Notas"><Textarea value={itemDraft.notes} onChange={(e) => setItemDraft({ ...itemDraft, notes: e.target.value })} /></Field><div className="flex flex-wrap justify-between gap-2"><div>{editingItem ? <Button type="button" variant="danger" onClick={removeItem}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setItemModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : editingItem ? <Pencil size={15} /> : null} Guardar</Button></div></div></fieldset></form>
      </Modal>

      <Modal open={paymentModal} onClose={() => { if (!saving) setPaymentModal(false); }} title={editingPayment ? "Editar pago" : "Nuevo pago"}>
        <form onSubmit={savePayment} className="grid min-w-0 gap-4">{formError ? <p role="alert" className="rounded-xl bg-[var(--burgundy-soft)] p-3 text-sm text-[var(--burgundy)]">{formError}</p> : null}<fieldset disabled={saving} className="grid min-w-0 gap-4"><Field label="Concepto"><Input required value={paymentDraft.concept} onChange={(e) => setPaymentDraft({ ...paymentDraft, concept: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Proveedor"><Select value={paymentDraft.vendor_id} onChange={(e) => setPaymentDraft({ ...paymentDraft, vendor_id: e.target.value })}><option value="">Sin proveedor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field><Field label="Rubro"><Select value={paymentDraft.budget_item_id} onChange={(e) => setPaymentDraft({ ...paymentDraft, budget_item_id: e.target.value })}><option value="">Sin rubro</option>{items.map((i) => <option key={i.id} value={i.id}>{i.concept}</option>)}</Select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Importe (ARS)"><Input type="number" min="0" step="0.01" value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} placeholder="Puede quedar vacío" /></Field><Field label="Vencimiento"><Input required type="date" value={paymentDraft.due_date} onChange={(e) => setPaymentDraft({ ...paymentDraft, due_date: e.target.value })} /></Field></div><Field label="Medio de pago"><Input value={paymentDraft.payment_method} onChange={(e) => setPaymentDraft({ ...paymentDraft, payment_method: e.target.value })} placeholder="Transferencia, efectivo..." /></Field><Field label="Notas"><Textarea value={paymentDraft.notes} onChange={(e) => setPaymentDraft({ ...paymentDraft, notes: e.target.value })} /></Field><div className="flex flex-wrap justify-between gap-2"><div>{editingPayment ? <Button type="button" variant="danger" onClick={removePayment}><Trash2 size={15} /> Eliminar</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setPaymentModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null} Guardar</Button></div></div></fieldset></form>
      </Modal>
    </div>
  );
}
