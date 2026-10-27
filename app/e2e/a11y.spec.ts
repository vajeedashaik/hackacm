import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/worker", "/employer", "/simulation"];

// WCAG 2.x A/AA rules via axe-core. Automated rules catch only part of accessibility; keyboard and
// language behaviour are covered separately in smoke.spec.ts.
for (const route of ROUTES) {
  for (const lang of ["en", "ta"]) {
    test(`axe: no WCAG A/AA violations on ${route} (${lang})`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem("fs-lang", l), lang);
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      expect(summary).toEqual([]);
    });
  }
}

// Every tab of both dashboards, not just the landing state (the employer view after unlocking).
test("axe: every worker and employer tab is free of WCAG A/AA violations", async ({ page }) => {
  const scan = async (where: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    return r.violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.nodes[0]?.target.join(" ")}`);
  };
  const found: string[] = [];

  await page.goto("/worker");
  await page.getByLabel("Who are you?").selectOption("c1");
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    found.push(...(await scan(`worker/${(await tab.textContent())?.trim()}`)));
  }

  await page.goto("/employer");
  await page.getByLabel("Employer PIN").fill("1234");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("tab").first()).toBeVisible();
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    found.push(...(await scan(`employer/${(await tab.textContent())?.trim()}`)));
  }
  expect(found).toEqual([]);
});
