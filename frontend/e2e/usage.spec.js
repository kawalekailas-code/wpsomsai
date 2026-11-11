import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { demoUsage } from "../src/lib/usage-demo.js";
import { seedDemo } from "../src/lib/demo.js";
const usageDialog = page => page.getByRole("dialog", { name: "System Usage", exact: true });
async function openUsage(page) { await page.getByRole("button", { name: "System Usage", exact: true }).click(); await expect(usageDialog(page)).toBeVisible(); }
async function mockRealUsage(page, { role = "admin", missing = false, hold = null } = {}) {
  const state = { calls: 0, status: missing ? 404 : 200, error: missing ? "Endpoint not found." : "Metrics temporarily unavailable.", hold, payload: demoUsage(seedDemo()) };
  state.payload.note = "Local mocked frontend fixture, not a production measurement.";
  await page.addInitScript(() => { localStorage.setItem("omsai_mode", "real"); localStorage.setItem("crm_token", "fictional-usage-test-token"); });
  const handler = async route => {
    const url = new URL(route.request().url()); let body = {}, status = 200;
    if (url.pathname === "/auth/me") body = { _id: "local-test-admin", username: "usage-test", role, preferences: {} };
    else if (url.pathname === "/api/config") body = { retentionDays: 30, connection: "cloud-api", voiceNotes: false };
    else if (url.pathname === "/api/contacts") body = { contacts: [], hasMore: false };
    else if (url.pathname === "/api/system/usage") { state.calls++; if (state.hold) await state.hold; status = state.status; body = status === 200 ? state.payload : { error: state.error }; }
    else throw new Error(`Unexpected usage-test API: ${url.pathname}`);
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  };
  await page.route("**/api/**", handler); await page.route("**/auth/**", handler); await page.route("**/socket.io/**", route => route.abort());
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Chats", exact: true })).toBeVisible(); return state;
}

test("usage demo: labeled metrics, private aggregate export and shortcuts without real sends", async ({ page }) => {
  const errors = [], requests = []; page.on("pageerror", e => errors.push(e.message)); page.on("request", r => { if (/graph\.facebook\.com|\/api\//.test(r.url())) requests.push(r.url()); });
  await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await openUsage(page);
  await expect(page.locator(".usage-metrics")).toBeVisible(); await expect(usageDialog(page)).toContainText("Fictional demo metrics"); await expect(page.locator(".usage-metric")).toHaveCount(4); await expect(page.getByRole("img", { name: /App HTTP requests per minute/ })).toBeVisible();
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export snapshot", exact: true }).click();
  const text = await fs.readFile(await (await pending).path(), "utf8"), data = JSON.parse(text); expect(data.version).toBe("2.3.0"); expect(data.runtime.scope).toContain("Fictional"); expect(text).not.toMatch(/919000000001|Neha Patil|wamid\./);
  await page.getByRole("button", { name: "Open Incoming Safety", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Incoming Safety", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openUsage(page); await page.getByRole("button", { name: "Open Template Sender", exact: true }).click(); await expect(page.getByLabel("Approved template")).toBeEnabled(); expect(errors).toEqual([]); expect(requests).toEqual([]);
});
test("usage mobile: menu access, readable measured/unknown values and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await page.getByRole("button", { name: "Back to chat list", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole("button", { name: "Chat list menu", exact: true }).click(); await page.getByRole("menuitem", { name: "System Usage", exact: true }).click(); await expect(page.locator(".usage-metrics")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390); expect(await page.locator(".usage-dialog .modal-body").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Open Incoming Safety", exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole("button", { name: "Open Incoming Safety", exact: true })).toBeInViewport(); await page.getByRole("button", { name: "Close dialog", exact: true }).click(); await expect(usageDialog(page)).toHaveCount(0);
});
test("usage never starts for an agent and admin-only entries are absent", async ({ page }) => {
  const state = await mockRealUsage(page, { role: "agent" }); await expect(page.getByRole("button", { name: "System Usage", exact: true })).toHaveCount(0); await page.getByRole("button", { name: "Chat list menu", exact: true }).click(); await expect(page.getByRole("menuitem", { name: "System Usage", exact: true })).toHaveCount(0); expect(state.calls).toBe(0);
});
test("missing backend explains the paired v2.3 update instead of displaying invented measurements", async ({ page }) => {
  const state = await mockRealUsage(page, { missing: true }); await openUsage(page); await expect(page.getByRole("alert")).toContainText("needs backend v2.3"); await expect(page.locator(".usage-metrics")).toHaveCount(0); await expect(page.getByRole("button", { name: "Export snapshot", exact: true })).toBeDisabled();
  state.status = 200; await page.getByRole("button", { name: "Refresh usage", exact: true }).click(); await expect(page.locator(".usage-metrics")).toBeVisible(); await expect(page.getByRole("alert")).toHaveCount(0); expect(state.calls).toBe(2);
});
test("unknown cgroup quotas/database stats are marked unavailable, not 0% of an assumed plan", async ({ page }) => {
  const state = await mockRealUsage(page); Object.assign(state.payload.runtime.cpu, { cgroupQuotaPercent: null, nodeQuotaPercent: null, quotaCores: null, quotaSource: null }); Object.assign(state.payload.runtime.memory, { cgroupUsedBytes: null, cgroupLimitBytes: null, cgroupPercent: null, nodeRssPercentOfLimit: null }); Object.assign(state.payload.database, { partial: true, unavailableMetrics: ["storage", "activity"], storage: { available: false, percent: null }, activity: null });
  await openUsage(page); await expect(page.locator(".usage-metrics")).toBeVisible(); await expect(page.locator(".usage-metric").first()).toContainText("one core; quota unavailable"); await expect(page.locator(".usage-metric").nth(1)).toContainText("Node RAM · RSS"); await expect(page.locator(".usage-metric").nth(1)).toContainText("not exposed"); await expect(page.locator(".usage-metric").nth(2)).toContainText("Unavailable"); await expect(page.locator(".sender-warning")).toContainText("Missing values are not zero usage"); await expect(page.getByRole("progressbar")).toHaveCount(1);
});
test("refresh failure retains a labeled stale snapshot and successful retry clears its warning", async ({ page }) => {
  const state = await mockRealUsage(page); await openUsage(page); await expect(page.locator(".usage-metrics")).toBeVisible();
  state.status = 503; await page.getByRole("button", { name: "Refresh usage", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("last successful snapshot"); await expect(page.locator(".usage-metrics")).toBeVisible();
  state.status = 200; await page.getByRole("button", { name: "Refresh usage", exact: true }).click(); await expect(page.getByRole("alert")).toHaveCount(0); expect(state.calls).toBe(3);
});
test("usage polling is visible-only, can be disabled, coalesces and stops after the dialog closes", async ({ page }) => {
  await page.clock.install(); const state = await mockRealUsage(page); await openUsage(page); await expect(page.locator(".usage-metrics")).toBeVisible(); expect(state.calls).toBe(1);
  await page.clock.runFor(16000); await expect.poll(() => state.calls).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); }); await page.clock.runFor(31000); expect(state.calls).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); }); await expect.poll(() => state.calls).toBe(3);
  await page.getByRole("checkbox", { name: /Auto-refresh while visible/ }).uncheck(); await page.clock.runFor(45000); expect(state.calls).toBe(3);
  await page.getByRole("button", { name: "Refresh usage", exact: true }).click(); await expect.poll(() => state.calls).toBe(4);
  await page.getByRole("checkbox", { name: /Auto-refresh while visible/ }).check(); await page.getByRole("button", { name: "Close dialog", exact: true }).click(); await page.clock.runFor(31000); expect(state.calls).toBe(4); await expect(usageDialog(page)).toHaveCount(0);
});
test("closing a pending usage read cannot reopen the dialog or overwrite later screens", async ({ page }) => {
  let release; const pending = new Promise(resolve => { release = resolve; }), errors = []; page.on("pageerror", e => errors.push(e.message));
  const state = await mockRealUsage(page, { hold: pending }); await openUsage(page); await expect(page.getByText("Reading lightweight usage counters…", { exact: true })).toBeVisible(); await expect.poll(() => state.calls).toBe(1);
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange")); }); expect(state.calls).toBe(1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click(); release(); await expect(usageDialog(page)).toHaveCount(0); await page.getByRole("button", { name: "Chat list menu", exact: true }).click(); await expect(page.getByRole("menuitem", { name: "System Usage", exact: true })).toBeVisible(); expect(errors).toEqual([]);
});
