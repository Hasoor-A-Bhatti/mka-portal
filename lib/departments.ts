import {
  Building2,
  CalendarCheck,
  Car,
  Handshake,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type FieldType = "text" | "number" | "date" | "select" | "textarea";

export type Field = {
  /** Column name in Supabase. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  /** Show as a column in the records table. */
  inTable?: boolean;
  /** Take the full width of the form. */
  wide?: boolean;
};

export type Department = {
  slug: string;
  name: string;
  short: string;
  description: string;
  icon: LucideIcon;
  /** Accent colour used for the glow, chips and highlights. */
  accent: string;
  /** Supabase table holding this department's records. */
  table: string;
  /** What one record is called, singular, lower case. */
  noun: string;
  plural: string;
  titleField: string;
  statusField: string;
  /** Statuses in workflow order. */
  statuses: string[];
  /** The figure shown on the overview: records in these statuses. */
  focus: { label: string; statuses: string[] };
  /** Default sort column for the records table. */
  orderBy: string;
  fields: Field[];
};

export const DEPARTMENTS: Department[] = [
  {
    slug: "delegations",
    name: "MKA Delegations",
    short: "Delegations",
    description: "Visiting delegations, their arrivals, departures and hosts.",
    icon: Handshake,
    accent: "#4a1fa8",
    table: "delegations",
    noun: "delegation",
    plural: "delegations",
    titleField: "name",
    statusField: "status",
    statuses: ["Planned", "Confirmed", "Arrived", "Departed", "Cancelled"],
    focus: { label: "upcoming", statuses: ["Planned", "Confirmed"] },
    orderBy: "arrival_date",
    fields: [
      { name: "name", label: "Delegation", type: "text", required: true, inTable: true, placeholder: "e.g. Ghana delegation" },
      { name: "country", label: "Country", type: "text", inTable: true },
      { name: "head_of_delegation", label: "Head of delegation", type: "text", inTable: true },
      { name: "members", label: "Members", type: "number" },
      { name: "arrival_date", label: "Arrives", type: "date", inTable: true },
      { name: "departure_date", label: "Departs", type: "date" },
      { name: "status", label: "Status", type: "select", required: true, options: ["Planned", "Confirmed", "Arrived", "Departed", "Cancelled"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
  {
    slug: "fleet",
    name: "MKA Fleet",
    short: "Fleet",
    description: "Vehicles, drivers and who has what on the road.",
    icon: Car,
    accent: "#3f51c9",
    table: "fleet_vehicles",
    noun: "vehicle",
    plural: "vehicles",
    titleField: "registration",
    statusField: "status",
    statuses: ["Available", "Assigned", "In service", "Off road"],
    focus: { label: "available now", statuses: ["Available"] },
    orderBy: "registration",
    fields: [
      { name: "registration", label: "Registration", type: "text", required: true, inTable: true, placeholder: "e.g. AB12 CDE" },
      { name: "make_model", label: "Make and model", type: "text", inTable: true },
      { name: "vehicle_type", label: "Type", type: "select", options: ["Car", "MPV", "Minibus", "Coach", "Van", "Other"], inTable: true },
      { name: "seats", label: "Seats", type: "number" },
      { name: "driver", label: "Driver", type: "text", inTable: true },
      { name: "status", label: "Status", type: "select", required: true, options: ["Available", "Assigned", "In service", "Off road"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
  {
    slug: "jaidat",
    name: "MKA Jaidat",
    short: "Jaidat",
    description: "Properties, halls and land, with their caretakers and condition.",
    icon: Building2,
    accent: "#9a6a0e",
    table: "jaidat_properties",
    noun: "property",
    plural: "properties",
    titleField: "name",
    statusField: "status",
    statuses: ["Active", "Under maintenance", "Vacant", "Disposed"],
    focus: { label: "under maintenance", statuses: ["Under maintenance"] },
    orderBy: "name",
    fields: [
      { name: "name", label: "Property", type: "text", required: true, inTable: true },
      { name: "property_type", label: "Type", type: "select", options: ["Residential", "Office", "Hall", "Land", "Other"], inTable: true },
      { name: "address", label: "Address", type: "text", inTable: true, wide: true },
      { name: "capacity", label: "Capacity", type: "number" },
      { name: "caretaker", label: "Caretaker", type: "text", inTable: true },
      { name: "status", label: "Status", type: "select", required: true, options: ["Active", "Under maintenance", "Vacant", "Disposed"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
  {
    slug: "special-arrangements",
    name: "MKA Special Arrangements",
    short: "Special Arrangements",
    description: "Events, VIP visits and one-off arrangements from request to done.",
    icon: CalendarCheck,
    accent: "#a2348f",
    table: "special_arrangements",
    noun: "arrangement",
    plural: "arrangements",
    titleField: "title",
    statusField: "status",
    statuses: ["Requested", "In progress", "Ready", "Completed", "Cancelled"],
    focus: { label: "in hand", statuses: ["Requested", "In progress"] },
    orderBy: "event_date",
    fields: [
      { name: "title", label: "Arrangement", type: "text", required: true, inTable: true },
      { name: "event_date", label: "Date", type: "date", inTable: true },
      { name: "venue", label: "Venue", type: "text", inTable: true },
      { name: "lead_contact", label: "Lead", type: "text", inTable: true },
      { name: "guests", label: "Guests", type: "number" },
      { name: "status", label: "Status", type: "select", required: true, options: ["Requested", "In progress", "Ready", "Completed", "Cancelled"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
  {
    slug: "storage",
    name: "MKA Storage",
    short: "Storage",
    description: "Stock, equipment and where everything is kept.",
    icon: Warehouse,
    accent: "#b4592a",
    table: "storage_items",
    noun: "item",
    plural: "items",
    titleField: "item_name",
    statusField: "status",
    statuses: ["In stock", "Low stock", "Reserved", "Out of stock"],
    focus: { label: "low or out", statuses: ["Low stock", "Out of stock"] },
    orderBy: "item_name",
    fields: [
      { name: "item_name", label: "Item", type: "text", required: true, inTable: true },
      { name: "category", label: "Category", type: "text", inTable: true },
      { name: "location", label: "Location", type: "text", inTable: true },
      { name: "quantity", label: "Quantity", type: "number", required: true, inTable: true },
      { name: "status", label: "Status", type: "select", required: true, options: ["In stock", "Low stock", "Reserved", "Out of stock"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

export function getDepartment(slug: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.slug === slug);
}

export function getDepartmentByTable(table: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.table === table);
}

const TONES: Record<string, string> = {
  // Good to go
  Available: "#15805a", Active: "#15805a", "In stock": "#15805a", Arrived: "#15805a", Ready: "#15805a", Confirmed: "#15805a",
  // Moving
  Assigned: "#3f51c9", "In progress": "#3f51c9", Planned: "#3f51c9", Reserved: "#3f51c9",
  // Needs attention
  "Low stock": "#9a6600", "Under maintenance": "#9a6600", "In service": "#9a6600", Requested: "#9a6600",
  // Stopped
  Cancelled: "#c43a3a", "Out of stock": "#c43a3a", "Off road": "#c43a3a", Disposed: "#c43a3a",
  // Finished
  Departed: "#6b6383", Completed: "#6b6383", Vacant: "#6b6383",
};

export function statusTone(status: unknown): string {
  return TONES[String(status)] ?? "#6b6383";
}
