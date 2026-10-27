import { timingSafeEqual } from "node:crypto";
import type { Actor } from "./domain";
import type { Db } from "./db/rows";
import { ServiceError } from "./errors";

/**
 * Resolve the caller. There is exactly one mode today:
 *
 *   DEMO MODE (FAIRSHIFT_DEMO_MODE=true) — clearly not production auth.
 *     * `x-demo-user: <profile uuid>` picks a seeded user.
 *     * Staff identities (supervisor / employer_admin) additionally need `x-employer-pin`
 *       matching EMPLOYER_PIN. The default PIN "1234" exists only outside production; in
 *       production the PIN must be configured or staff access is refused.
 *     * Worker identities are NOT authenticated in demo mode (anyone who knows an id can act as
 *       that worker). Never enable demo mode with real data.
 *
 * Without demo mode every request is refused (503) until Supabase Auth is wired to a database
 * adapter: verify the user's JWT, then load role/org from `profiles`. There is no header or
 * parameter that grants employer access without the PIN.
 */
export const demoModeEnabled = () => process.env.FAIRSHIFT_DEMO_MODE === "true";

function employerPin(): string | null {
  const p = process.env.EMPLOYER_PIN;
  if (p) return p;
  return process.env.NODE_ENV === "production" ? null : "1234";
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function resolveActor(req: Request, db: Db): Actor {
  if (!demoModeEnabled()) {
    throw new ServiceError(503, "Authentication is not configured. Set FAIRSHIFT_DEMO_MODE=true for the demo, or wire Supabase Auth.");
  }
  const userId = req.headers.get("x-demo-user");
  const profile = userId ? db.profiles.find((p) => p.id === userId) : undefined;
  if (!profile) throw new ServiceError(401, "Unknown user");
  if (profile.role !== "worker") {
    const pin = employerPin();
    const given = req.headers.get("x-employer-pin") ?? "";
    if (!pin || !safeEqual(given, pin)) throw new ServiceError(403, "Staff access requires the employer PIN");
  }
  return { userId: profile.id, orgId: profile.org_id, role: profile.role, kind: "human" };
}
