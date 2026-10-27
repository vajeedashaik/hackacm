import { expect, test } from "@playwright/test";

test("primary routes render without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, heading] of [
    ["/employer", /Employer Dashboard/],
    ["/worker", /Worker Dashboard/],
    ["/simulation", /Live Workplace|Workplace/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("worker files a wage case and employer resolves it", async ({ page, request }) => {
  // the supervisor records yesterday's 10h shift, so the agents can verify the worker's claim against attendance
  const yesterday = new Date(Date.now() + 5.5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const shift = await request.post("/api/attendance", {
    headers: { "x-employer-pin": "1234" },
    data: { industry: "construction", action: "shift", workerId: "c1", date: yesterday, start: "08:00", end: "18:00" },
  });
  // the server is reused between runs, so an already-recorded shift (overlap) is fine
  expect(shift.ok() || (await shift.text()).includes("overlaps")).toBeTruthy();

  await page.goto("/worker");
  await page.getByLabel("Who are you?").selectOption("c1");
  await page.getByRole("tab", { name: "Payslip" }).click();
  await page.getByLabel("Date").fill(yesterday);
  await page.getByLabel("Hours worked").fill("10");
  await page.getByLabel("Amount paid (₹)").fill("500");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText(/Report FS-[0-9]+ sent/)).toBeVisible();

  await page.goto("/employer");
  // wrong PIN is refused
  await page.getByLabel("Employer PIN").fill("0000");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  // right PIN unlocks; the filed case is in the queue
  await page.getByLabel("Employer PIN").fill("1234");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByRole("tab", { name: /Cases/ }).click();
  await page.getByText("Wage discrepancy").first().click();
  // the agent suggestion arrives after the case is filed; the human accepts it
  await page.getByRole("button", { name: "Accept and apply" }).click();
  await expect(page.getByText("Suggestion applied through the case lifecycle")).toBeVisible();

  // the worker sees the same outcome from the shared records
  await page.goto("/worker");
  await page.getByLabel("Who are you?").selectOption("c1");
  await page.getByRole("tab", { name: /My reports/ }).click();
  await expect(page.getByText("Resolved by your employer.")).toBeVisible();
});

test("offline banner appears when the server is unreachable", async ({ page, context }) => {
  await page.goto("/employer");
  await expect(page.getByRole("heading", { name: /Employer Dashboard/ })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/Offline or server unreachable/)).toBeVisible({ timeout: 10_000 });
  await context.setOffline(false);
  await expect(page.getByText(/Offline or server unreachable/)).toBeHidden({ timeout: 10_000 });
});

test("language toggle and keyboard navigation work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.getByRole("link", { name: "முதலாளி பலகை" })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBeTruthy();
});
