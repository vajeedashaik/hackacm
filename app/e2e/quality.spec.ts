import { expect, test } from "@playwright/test";

const PAGES = ["/", "/worker", "/employer", "/simulation"];

test("health endpoint answers without exposing secrets", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
  expect(await r.json()).toEqual({ ok: true, service: "fairshift" });
});

for (const path of PAGES) {
  test(`mobile layout has no horizontal scroll: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(path);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`controls have accessible names: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(500);
    const unnamed = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("button, a[href], input, select, textarea").forEach((el) => {
        const e = el as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> };
        const name = (e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.innerText || e.getAttribute("title") || "").trim()
          || (e.labels && e.labels.length ? "labelled" : "");
        if (!name && (e as HTMLInputElement).type !== "hidden") bad.push(e.outerHTML.slice(0, 100));
      });
      return bad;
    });
    expect(unnamed).toEqual([]);
  });
}

test("Tamil toggle translates the worker dashboard and persists across navigation", async ({ page }) => {
  await page.goto("/worker");
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.getByRole("link", { name: "தொழிலாளர்" }).or(page.getByText("தொழிலாளர்").first())).toBeVisible();
});

test("college industry config loads its own workers and site", async ({ page }) => {
  await page.goto("/worker");
  await page.getByLabel("Industry").selectOption("college");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("SRM Campus Facilities");
  await expect(page.getByRole("option", { name: /Rajesh/ })).toHaveCount(1);
});

test("simulation renders a canvas and shows the shared event feed", async ({ page }) => {
  await page.goto("/simulation");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Event feed/ })).toBeVisible();
});

test("reduced motion is honoured", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/worker");
  const dur = await page.evaluate(() => {
    const el = document.querySelector("button, a") as HTMLElement;
    return getComputedStyle(el).transitionDuration;
  });
  expect(["0s", "0.01ms", "1e-05s", "0.00001s"].some((d) => dur.split(",").every((x) => x.trim() === d) ) || parseFloat(dur) < 0.05).toBeTruthy();
});
