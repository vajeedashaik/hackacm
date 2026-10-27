import { expect, test } from "@playwright/test";

test("security headers are set and the server does not advertise its framework", async ({ request }) => {
  const r = await request.get("/worker");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});

for (const route of ["/", "/worker", "/employer", "/simulation"]) {
  test(`the CSP blocks nothing the app needs: ${route}`, async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        ((window as unknown as { __csp: string[] }).__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    page.on("console", (m) => { if (/content security policy/i.test(m.text())) violations.push(m.text()); });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const inPage = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    expect([...violations, ...inPage]).toEqual([]);
  });
}

test("employer-only and state-changing endpoints refuse unauthenticated callers", async ({ request }) => {
  const json = { "content-type": "application/json" };
  expect((await request.patch("/api/cases/FS-0001", { headers: json, data: {} })).status()).toBe(403);
  expect((await request.post("/api/agents/proposals/FS-0001", { headers: json, data: {} })).status()).toBe(403);
  expect((await request.post("/api/vapi/tools", { headers: json, data: {} })).status()).toBe(401);
  // without the PIN the state endpoint serves only the empty, non-employer view
  const s = await (await request.get("/api/state?industry=construction")).json();
  expect(s.employer).toBe(false);
  expect(s.cases).toEqual([]);
  expect(s.feedback).toEqual([]);
});

test("wrong employer PINs are rate limited", async ({ request }) => {
  const codes: number[] = [];
  for (let i = 0; i < 14; i++) {
    const r = await request.patch("/api/cases/FS-0001", { headers: { "x-employer-pin": `wrong-${i}`, "content-type": "application/json" }, data: {} });
    codes.push(r.status());
  }
  expect(codes).toContain(429);
});

test("oversized request bodies are rejected", async ({ request }) => {
  const r = await request.post("/api/feedback", {
    headers: { "content-type": "application/json" },
    data: { industry: "construction", mode: "anonymous", category: "pay", text: "x".repeat(20_000) },
  });
  expect(r.status()).toBe(413);
});
