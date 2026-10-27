import type { IndustryConfig, IndustryId } from "./types";

// Rates, allowances and deduction amounts are demo configuration, not statutory figures.
export const INDUSTRIES: Record<IndustryId, IndustryConfig> = {
  construction: {
    id: "construction",
    label: { en: "Construction site", ta: "கட்டுமான தளம்" },
    site: "Anna Nagar Tower Site",
    overtimeAfter: 8,
    overtimeMultiplier: 2,
    maxSafeHours: 10,
    maxWeeklyHours: 48,
    minRestHours: 11,
    maxConsecutiveDays: 6,
    shift: { start: "08:00", end: "17:00" },
    allowancePerDay: { label: { en: "Site travel allowance", ta: "தள பயணப்படி" }, amount: 50 },
    deductionPerDay: { label: { en: "Safety gear fund", ta: "பாதுகாப்பு உபகரண நிதி" }, amount: 10 },
    safetyCategories: [
      { id: "fall", label: { en: "Fall / height hazard", ta: "உயரம் / விழும் ஆபத்து" } },
      { id: "equipment", label: { en: "Unsafe equipment", ta: "பாதுகாப்பற்ற கருவி" } },
      { id: "electrical", label: { en: "Electrical hazard", ta: "மின் ஆபத்து" } },
      { id: "ppe", label: { en: "Missing protective gear", ta: "பாதுகாப்பு உபகரணம் இல்லை" } },
      { id: "injury", label: { en: "Injury or near miss", ta: "காயம் / தவிர்க்கப்பட்ட விபத்து" } },
      { id: "other", label: { en: "Other", ta: "மற்றவை" } },
    ],
    skillSuggestions: ["Scaffolding", "Bar bending", "Shuttering", "Concrete mixing", "Basic first aid"],
    reviewers: ["Site supervisor", "HR officer", "Safety officer"],
    zones: [
      { name: "Scaffolding", x: 40, y: 40, w: 260, h: 150, color: 0xc9a46a },
      { name: "Mixing yard", x: 330, y: 40, w: 230, h: 150, color: 0x9aa5ad },
      { name: "Material store", x: 40, y: 230, w: 200, h: 130, color: 0xb98b5e },
      { name: "Site office", x: 270, y: 230, w: 290, h: 130, color: 0x7fa3c7 },
    ],
    workers: [
      { id: "c1", name: "Murugan", role: "Mason", hourlyRate: 90, color: "#e4572e" },
      { id: "c2", name: "Selvi", role: "Helper", hourlyRate: 65, color: "#17bebb" },
      { id: "c3", name: "Karthik", role: "Electrician", hourlyRate: 110, color: "#ffc914" },
      { id: "c4", name: "Lakshmi", role: "Bar bender", hourlyRate: 85, color: "#9b5de5" },
    ],
  },
  college: {
    id: "college",
    label: { en: "College facilities", ta: "கல்லூரி வசதிகள் பராமரிப்பு" },
    site: "SRM Campus Facilities",
    overtimeAfter: 8,
    overtimeMultiplier: 1.5,
    maxSafeHours: 11,
    maxWeeklyHours: 54,
    minRestHours: 10,
    maxConsecutiveDays: 6,
    shift: { start: "07:00", end: "16:00" },
    allowancePerDay: { label: { en: "Meal allowance", ta: "உணவுப்படி" }, amount: 40 },
    deductionPerDay: { label: { en: "Uniform upkeep", ta: "சீருடை பராமரிப்பு" }, amount: 5 },
    safetyCategories: [
      { id: "electrical", label: { en: "Electrical fault", ta: "மின் கோளாறு" } },
      { id: "slip", label: { en: "Wet floor / slip risk", ta: "ஈரத் தரை / வழுக்கும் ஆபத்து" } },
      { id: "chemical", label: { en: "Cleaning chemical / lab hazard", ta: "இரசாயனம் / ஆய்வக ஆபத்து" } },
      { id: "fire", label: { en: "Fire safety", ta: "தீ பாதுகாப்பு" } },
      { id: "injury", label: { en: "Injury or near miss", ta: "காயம் / தவிர்க்கப்பட்ட விபத்து" } },
      { id: "other", label: { en: "Other", ta: "மற்றவை" } },
    ],
    skillSuggestions: ["Plumbing", "Electrical maintenance", "HVAC basics", "Chemical handling", "Basic first aid"],
    reviewers: ["Facilities manager", "HR officer", "Safety officer"],
    zones: [
      { name: "Hostel block", x: 40, y: 40, w: 230, h: 150, color: 0xd9b8c4 },
      { name: "Lab building", x: 300, y: 40, w: 260, h: 150, color: 0xa8c3a0 },
      { name: "Canteen", x: 40, y: 230, w: 230, h: 130, color: 0xe6c88f },
      { name: "Maintenance room", x: 300, y: 230, w: 260, h: 130, color: 0x8fa9c9 },
    ],
    workers: [
      { id: "f1", name: "Rajesh", role: "Plumber", hourlyRate: 100, color: "#e4572e" },
      { id: "f2", name: "Meena", role: "Housekeeping", hourlyRate: 70, color: "#17bebb" },
      { id: "f3", name: "Anwar", role: "Electrician", hourlyRate: 115, color: "#ffc914" },
      { id: "f4", name: "Priya", role: "Canteen staff", hourlyRate: 75, color: "#9b5de5" },
    ],
  },
};

export const industryIds = Object.keys(INDUSTRIES) as IndustryId[];
