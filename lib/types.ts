export type Wedding = {
  id: string;
  slug: string;
  invite_code: string;
  partner_one_name: string;
  partner_two_name: string;
  civil_date: string;
  ceremony_date: string;
  civil_location: string | null;
  ceremony_name: string | null;
  ceremony_address: string | null;
  reception_name: string | null;
  reception_address: string | null;
  guest_target: number;
  budget_target: number | null;
  currency: string;
};

export type GuestGroup = {
  id: string;
  wedding_id: string;
  name: string;
  group_type: string;
  notes: string | null;
};

export type Guest = {
  id: string;
  wedding_id: string;
  group_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  relationship_side: "agustin" | "agustina" | "both";
  is_child: boolean;
  dietary_notes: string | null;
  notes: string | null;
};

export type GuestInvitation = {
  id: string;
  wedding_id: string;
  guest_id: string;
  event_type: "civil" | "church" | "party";
  invited: boolean;
  rsvp: "pending" | "confirmed" | "declined";
  notes: string | null;
};

export type Task = {
  id: string;
  wedding_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  category: string;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  linked_event_type: "civil" | "church" | "party" | null;
  vendor_id: string | null;
};

export type CalendarEvent = {
  id: string;
  wedding_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  event_type: "milestone" | "appointment" | "payment" | "custom";
  category: string;
  google_event_id: string | null;
  google_sync_state: "not_connected" | "pending" | "synced" | "error";
};

export type Vendor = {
  id: string;
  wedding_id: string;
  category: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
  address: string | null;
  status: "contacted" | "quoted" | "booked" | "paid" | "cancelled";
  notes: string | null;
};

export type BudgetItem = {
  id: string;
  wedding_id: string;
  vendor_id: string | null;
  category: string;
  concept: string;
  estimated_amount: number | null;
  final_amount: number | null;
  status: "planned" | "quoted" | "confirmed" | "closed";
  notes: string | null;
};

export type Payment = {
  id: string;
  wedding_id: string;
  vendor_id: string | null;
  budget_item_id: string | null;
  concept: string;
  amount: number | null;
  due_date: string;
  paid: boolean;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  recurrence_group: string | null;
};

export type WeddingDocument = {
  id: string;
  wedding_id: string;
  vendor_id: string | null;
  category: string;
  title: string;
  status: "missing" | "pending" | "ready" | "delivered";
  due_date: string | null;
  notes: string | null;
  storage_path: string | null;
  filename: string | null;
  mime_type: string | null;
  source_url: string | null;
};

export type SeatingTable = {
  id: string;
  wedding_id: string;
  name: string;
  capacity: number;
  shape: "round" | "rectangular" | "other";
  notes: string | null;
};

export type TableAssignment = {
  id: string;
  wedding_id: string;
  table_id: string;
  guest_id: string;
  seat_number: number | null;
};
