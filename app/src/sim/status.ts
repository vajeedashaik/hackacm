import type { EventCategory, SimStatus } from "./types.ts";

export interface StatusMeta { label: string; icon: string; color: string; hex: number; hint: string }

// Every state has an icon and a text label as well as a colour (never colour alone).
export const STATUS_META: Record<SimStatus, StatusMeta> = {
  working: { label: "Working", icon: "⚙️", color: "#15803d", hex: 0x22c55e, hint: "On shift and at their workstation" },
  break: { label: "On break", icon: "☕", color: "#0369a1", hex: 0x38bdf8, hint: "Resting in the break area" },
  offshift: { label: "Off shift", icon: "💤", color: "#6b7280", hex: 0x9ca3af, hint: "Not on shift (shown faded, near the gate)" },
  overtime: { label: "Overtime concern", icon: "⏱️", color: "#b45309", hex: 0xf59e0b, hint: "Hours are past the overtime or safe-hours threshold" },
  safety: { label: "Safety incident", icon: "🚨", color: "#b91c1c", hex: 0xef4444, hint: "Hazard or incident in a safety zone" },
  investigating: { label: "Investigation in progress", icon: "🔍", color: "#6d28d9", hex: 0xa855f7, hint: "Someone is checking the facts" },
  review: { label: "Human review required", icon: "✋", color: "#be185d", hex: 0xec4899, hint: "A person must decide before this can close" },
  resolved: { label: "Resolved case", icon: "✅", color: "#166534", hex: 0x4ade80, hint: "Case closed" },
};

export const STATUS_ORDER = Object.keys(STATUS_META) as SimStatus[];

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  system: "System", attendance: "Attendance", hours: "Hours", wage: "Wage", safety: "Safety", grievance: "Grievance",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as EventCategory[];

export const SOURCE_LABEL = { synthetic: "DEMO", app: "LIVE", agent: "AGENT" } as const;
