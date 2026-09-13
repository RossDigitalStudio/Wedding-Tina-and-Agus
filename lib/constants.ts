export const EVENT_LABELS = {
  civil: "Civil",
  church: "Iglesia",
  party: "Fiesta",
} as const;

export const TASK_STATUS = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Hecho",
} as const;

export const RSVP_STATUS = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  declined: "No asiste",
} as const;

export const TASK_CATEGORIES = [
  "General",
  "Civil",
  "Iglesia",
  "Fiesta",
  "Invitados",
  "Vestimenta",
  "Proveedores",
  "Documentación",
  "Presupuesto",
  "Decoración",
  "Música",
  "Fotografía",
] as const;

export const VENDOR_CATEGORIES = [
  "Salón",
  "Iglesia",
  "Fotografía",
  "Video",
  "Vestido",
  "Traje",
  "Alianzas",
  "Decoración",
  "Flores",
  "Belleza",
  "Transporte",
  "Papelería",
  "Otros",
] as const;

export const BUDGET_CATEGORIES = [
  "Salón",
  "Ceremonia",
  "Vestimenta",
  "Fotografía y video",
  "Decoración",
  "Belleza",
  "Alianzas",
  "Papelería",
  "Transporte",
  "Regalos",
  "Otros",
] as const;
