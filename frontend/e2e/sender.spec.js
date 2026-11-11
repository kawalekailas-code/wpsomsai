import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
async function openSender(page) { await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await page.getByRole("button", { name: "Template Sender", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Template Sender", exact: true })).toBeVisible(); await expect(page.getByLabel("Approved template")).toBeEnabled(); }
async function prepare(page) { await page.getByLabel("Approved template").selectOption("demo_greeting|en"); await page.getByLabel("Body parameter 1", { exact: true }).fill("Friend"); await page.getByRole("button", { name: "Preview recipients", exact: true }).click(); await expect(page.locator(".sender-preview-counts")).toContainText("7"); await page.getByRole("checkbox", { name: /I verified opt-in/ }).check(); await page.getByRole("checkbox", { name: /I understand Meta charges/ }).check(); }
async function downloadText(page, action) { const pending = page.waitForEvent("download"); await action(); return fs.readFile(await (await pending).path(), "utf8"); }

test("sender: confirm one job, pause/resume/cancel and retain progress after reload without network sends", async ({ page }) => {
  const errors = [], requests = []; page.on("pageerror", e => errors.push(e.message)); page.on("request", r => { if (/graph\.facebook\.com|\/api\//.test(r.url())) requests.push(r.url()); });
  await openSender(page); await prepare(page); await page.getByRole("button", { name: "Review sending job", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review before queueing" })).toBeVisible(); await page.getByRole("button", { name: "Confirm and queue", exact: true }).click();
  await expect(page.locator(".sender-counts")).toBeVisible(); await page.getByRole("button", { name: "Pause", exact: true }).click(); await expect(page.locator(".sender-job-header .sender-state")).toHaveText("paused");
  const report = await downloadText(page, () => page.getByRole("button", { name: "Download full report", exact: true }).click()); expect(report).toContain("'+919000000001"); expect(report).toContain("pending");
  await page.reload(); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await page.getByRole("button", { name: "Template Sender", exact: true }).click(); await page.getByRole("tab", { name: "Saved jobs", exact: true }).click(); await page.locator(".sender-job-card").first().click(); await expect(page.locator(".sender-job-header .sender-state")).toHaveText("paused");
  await page.getByRole("button", { name: "Resume pending", exact: true }).click(); await expect(page.locator(".sender-job-header .sender-state")).toHaveText("running");
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Cancel pending", exact: true }).click(); await expect(page.locator(".sender-job-header .sender-state")).toHaveText("cancelled"); expect(errors).toEqual([]); expect(requests).toEqual([]);
});
test("sender: CSV validation, permission gate and opt-out suppression", async ({ page }) => {
  await openSender(page); await page.getByRole("tab", { name: "Do-not-send", exact: true }).click(); await page.getByLabel("Do-not-send phone number").fill("+919000000001"); await page.getByRole("button", { name: "Block template sends", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove suppression", exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "New send", exact: true }).click(); await page.getByLabel("Approved template").selectOption("demo_greeting|en"); await page.getByLabel("Body parameter 1", { exact: true }).fill("Friend"); await page.getByLabel("Recipient source").selectOption("csv");
  await page.getByLabel("Recipient CSV", { exact: true }).setInputFiles({ name: "recipients.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Phone\nBlocked,+919000000001\nGood,+919000000002\nAgain,+919000000002\nInvalid,not-a-number\n") });
  await page.getByRole("button", { name: "Preview recipients", exact: true }).click(); await expect(page.locator(".sender-preview-rows")).toContainText("blocked"); await expect(page.locator(".sender-preview-rows")).toContainText("duplicate"); await expect(page.locator(".sender-preview-rows")).toContainText("invalid");
  await expect(page.getByRole("button", { name: "Review sending job", exact: true })).toBeDisabled();
  const report = await downloadText(page, () => page.getByRole("button", { name: /Full preview report/ }).click()); expect(report).toContain("not-a-number"); expect(report).toContain("Do-not-send");
  await page.getByRole("checkbox", { name: /I verified opt-in/ }).check(); await page.getByRole("checkbox", { name: /I understand Meta charges/ }).check(); await expect(page.getByRole("button", { name: "Review sending job", exact: true })).toBeEnabled();
});
test("sender: media template requires matching upload and uses Marathi metadata", async ({ page }) => {
  await openSender(page); await page.getByLabel("Approved template").selectOption("demo_photo_update|mr"); await expect(page.locator(".template-preview-bubble")).toContainText("नमस्कार");
  await page.getByRole("button", { name: "Preview recipients", exact: true }).click(); await page.getByRole("checkbox", { name: /I verified opt-in/ }).check(); await page.getByRole("checkbox", { name: /I understand Meta charges/ }).check(); await expect(page.getByRole("button", { name: "Review sending job", exact: true })).toBeDisabled();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMwoAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Template media file").setInputFiles({ name: "header.png", mimeType: "image/png", buffer: png }); await expect(page.locator(".template-media-placeholder")).toContainText("header.png");
  await page.getByRole("button", { name: "Preview recipients", exact: true }).click(); await page.getByRole("checkbox", { name: /I verified opt-in/ }).check(); await page.getByRole("checkbox", { name: /I understand Meta charges/ }).check(); await expect(page.getByRole("button", { name: "Review sending job", exact: true })).toBeEnabled();
});
test("incoming safety: inspect/export captured BSUID event, retry and acknowledge without deletion", async ({ page }) => {
  const requests = []; page.on("request", r => { if (/graph\.facebook\.com|\/api\//.test(r.url())) requests.push(r.url()); });
  await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await page.getByRole("button", { name: "Incoming Safety", exact: true }).click(); await expect(page.locator(".safety-cards")).toBeVisible();
  await page.locator(".safety-event").first().click(); await expect(page.locator(".safety-json")).toContainText("IN.FICTIONAL_DEMO_ONLY");
  const text = await downloadText(page, () => page.getByRole("button", { name: "Export private event JSON", exact: true }).click()); expect(text).toContain("fictional hidden-number");
  await page.getByRole("button", { name: "Retry processing", exact: true }).click(); await page.locator(".safety-event").first().click(); await expect(page.getByRole("button", { name: "Mark event reviewed", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I reviewed this captured event/ }).check(); await page.getByRole("button", { name: "Mark event reviewed", exact: true }).click(); await page.locator(".safety-event").first().click(); await expect(page.locator(".safety-json")).toContainText("IN.FICTIONAL_DEMO_ONLY"); expect(requests).toEqual([]);
});
test("mobile: sender and safety available through menu with no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible();
  await page.getByRole("button", { name: "Back to chat list", exact: true }).click(); await page.getByRole("button", { name: "Chat list menu", exact: true }).click(); await page.getByRole("menuitem", { name: "Template Sender", exact: true }).click(); await expect(page.getByLabel("Approved template")).toBeVisible(); await page.getByLabel("Approved template").selectOption("demo_greeting|en");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390); await page.getByRole("dialog", { name: "Template Sender", exact: true }).getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Chat list menu", exact: true }).click(); await page.getByRole("menuitem", { name: "Incoming Safety", exact: true }).click(); await expect(page.locator(".safety-cards")).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("real-mode frontend catches up stored incoming after offline/reconnect without a socket event", async ({ page, context }) => {
  const phone = "919000000001", user = { _id: "test-admin", role: "admin", username: "test", preferences: {} };
  const storedAt = new Date().toISOString();
  const base = { _id: "initial-message", phone, direction: "incoming", type: "text", message: "Initially loaded", status: "delivered", createdAt: storedAt, updatedAt: storedAt, receivedAt: storedAt };
  const missed = { ...base, _id: "missed-message", message: "Stored while disconnected", createdAt: new Date(Date.now() - 3600000).toISOString(), receivedAt: new Date(Date.now() + 10).toISOString() };
  let missedExists = false, syncCalls = 0;
  await page.addInitScript(() => { localStorage.setItem("omsai_mode", "real"); localStorage.setItem("crm_token", "fictional-test-token"); });
  const contact = { phone, name: "Fictional test contact", lastInboundAt: storedAt, hasUnread: true };
  const api = async route => {
    const url = new URL(route.request().url()); let body = {};
    if (url.pathname === "/auth/me") body = user;
    else if (url.pathname === "/api/config") body = { retentionDays: 30, connection: "cloud-api", voiceNotes: false };
    else if (url.pathname === "/api/contacts") body = { contacts: [contact], hasMore: false };
    else if (url.pathname === `/api/contacts/${phone}`) body = contact;
    else if (url.pathname === `/api/messages/${phone}`) body = { messages: [base], syncCursor: "test-checkpoint", readThrough: storedAt, nextCursor: null };
    else if (url.pathname === `/api/chats/${phone}/sync`) { syncCalls++; body = { messages: missedExists ? [missed] : [], removed: [], hasMore: false, syncCursor: "test-checkpoint-next", readThrough: new Date().toISOString() }; }
    else if (url.pathname === `/api/chats/${phone}/read`) body = { success: true };
    else throw new Error(`Unexpected test API request: ${url.pathname}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  };
  await page.route("**/auth/**", api); await page.route("**/api/**", api); await page.route("**/socket.io/**", route => route.abort());
  await page.goto("/"); await page.locator(".chat-open").first().click(); await expect(page.locator(".message-row").filter({ hasText: "Initially loaded" })).toBeVisible();
  await context.setOffline(true); missedExists = true; await context.setOffline(false);
  await expect(page.locator(".message-row").filter({ hasText: "Stored while disconnected" })).toBeVisible();
  await page.getByRole("button", { name: "Sync stored messages", exact: true }).click(); await expect(page.locator(".sync-note")).toHaveCount(0);
  await expect(page.locator(".message-row").filter({ hasText: "Stored while disconnected" })).toHaveCount(1); expect(syncCalls).toBeGreaterThan(0);
});

async function mockRealThread(page) {
  const phone = "919000000001", at = new Date().toISOString(), user = { _id: "test-admin", role: "admin", username: "test", preferences: {} };
  const state = { missed: false, reads: [], clears: 0, syncs: 0, hold: null, began: null, hidden: false, includeAllSync: false };
  const contact = { phone, name: "Fictional test contact", lastInboundAt: at, hasUnread: true };
  const base = { _id: "initial-message", phone, direction: "incoming", type: "text", message: "Initial visible message", status: "delivered", createdAt: at, receivedAt: at, context: { messageId: "historical-anchor", message: "Earlier quote", direction: "incoming" } };
  const anchor = { ...base, _id: "historical-anchor", message: "Historical search window", context: null, createdAt: new Date(Date.now() - 7200000).toISOString() };
  const missed = { ...base, _id: "missed-message", message: "New incoming outside history window", context: null, receivedAt: new Date(Date.now() + 10).toISOString() };
  await page.addInitScript(() => { localStorage.setItem("omsai_mode", "real"); localStorage.setItem("crm_token", "fictional-test-token"); });
  const api = async route => {
    const url = new URL(route.request().url()); let body = {};
    if (url.pathname === "/auth/me") body = user;
    else if (url.pathname === "/api/config") body = { retentionDays: 30, connection: "cloud-api", voiceNotes: false };
    else if (url.pathname === "/api/contacts") body = { contacts: [contact], hasMore: false };
    else if (url.pathname === `/api/contacts/${phone}`) body = contact;
    else if (url.pathname === `/api/messages/${phone}`) body = { messages: url.searchParams.has("around") ? [anchor] : state.missed ? [base, missed] : [base], syncCursor: "test-cursor", readThrough: at, nextCursor: null };
    else if (url.pathname === `/api/chats/${phone}/sync`) {
      state.syncs++; const wasCleared = state.clears > 0;
      body = { messages: wasCleared ? [] : state.missed ? state.includeAllSync && !state.hidden ? [base, missed] : [missed] : [], removed: state.hidden ? [base._id] : [], clearedAt: wasCleared ? new Date(Date.now() + 500).toISOString() : null, hasMore: false, syncCursor: "test-next", readThrough: at };
      if (state.hold) { const hold = state.hold; state.hold = null; state.began?.(); await hold; }
    } else if (url.pathname === `/api/chats/${phone}/read`) { state.reads.push(route.request().postDataJSON()); body = { success: true }; }
    else if (url.pathname === `/api/chats/${phone}/clear`) { state.clears++; body = { success: true }; }
    else if (url.pathname === "/api/messages/initial-message" && route.request().method() === "DELETE") { state.hidden = true; body = { success: true }; }
    else throw new Error(`Unexpected test API: ${url.pathname}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  };
  await page.route("**/auth/**", api); await page.route("**/api/**", api); await page.route("**/socket.io/**", route => route.abort());
  await page.goto("/"); await page.locator(".chat-open").first().click(); await expect(page.locator(".message-row").filter({ hasText: "Initial visible message" })).toBeVisible(); await expect.poll(() => state.reads.length).toBe(1);
  return state;
}
test("catch-up around a search/quote window neither injects unseen incoming nor marks it read", async ({ page, context }) => {
  const state = await mockRealThread(page);
  await page.locator(".quoted-message").click(); await expect(page.locator(".message-row").filter({ hasText: "Historical search window" })).toBeVisible();
  state.missed = true; await context.setOffline(true); await context.setOffline(false); await expect.poll(() => state.syncs).toBeGreaterThan(0); await expect(page.locator(".sync-note")).toHaveCount(0);
  await expect(page.locator(".message-row").filter({ hasText: "New incoming outside history window" })).toHaveCount(0); expect(state.reads.length).toBe(1);
  await page.getByRole("button", { name: "Jump to latest messages", exact: true }).click(); await expect(page.locator(".message-row").filter({ hasText: "New incoming outside history window" })).toBeVisible(); await expect.poll(() => state.reads.length).toBe(2);
});
test("clearing a chat invalidates an older in-flight catch-up response instead of resurrecting history", async ({ page }) => {
  const state = await mockRealThread(page); state.missed = true; let release;
  state.hold = new Promise(resolve => { release = resolve; }); const began = new Promise(resolve => { state.began = resolve; });
  await page.getByRole("button", { name: "Sync stored messages", exact: true }).click(); await began;
  await page.getByRole("button", { name: "Conversation menu", exact: true }).click(); await page.getByRole("menuitem", { name: "Clear chat for me", exact: true }).click(); await page.getByRole("button", { name: "Clear for me", exact: true }).click();
  await expect(page.locator(".message-row")).toHaveCount(0); release(); await expect(page.locator(".sync-note")).toHaveCount(0); await expect(page.locator(".message-row")).toHaveCount(0); expect(state.clears).toBe(1);
});

test("delete-for-me invalidates an older in-flight sync snapshot without hiding other new incoming", async ({ page }) => {
  const state = await mockRealThread(page); state.missed = true; state.includeAllSync = true; let release;
  state.hold = new Promise(resolve => { release = resolve; }); const began = new Promise(resolve => { state.began = resolve; });
  await page.getByRole("button", { name: "Sync stored messages", exact: true }).click(); await began;
  const row = page.locator(".message-row").filter({ hasText: "Initial visible message" }); await row.getByRole("button", { name: /Message options:/ }).click(); await page.getByRole("menuitem", { name: "Delete for me", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Delete for me", exact: true }).click();
  await expect(page.locator(".message-row").filter({ hasText: "Initial visible message" })).toHaveCount(0); release(); await expect(page.locator(".sync-note")).toHaveCount(0);
  await expect(page.locator(".message-row").filter({ hasText: "Initial visible message" })).toHaveCount(0); await expect(page.locator(".message-row").filter({ hasText: "New incoming outside history window" })).toBeVisible(); expect(state.hidden).toBe(true);
});
