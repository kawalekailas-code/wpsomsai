import { test, expect } from "@playwright/test";

const open = async page => { await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); };
const composer = page => page.getByRole("textbox", { name: "Type a message" });
async function send(page, text) { await composer(page).fill(text); await page.getByRole("button", { name: "Send message", exact: true }).click(); await expect(page.locator(".message-row").filter({ hasText: text }).last()).toBeVisible(); }
async function messageMenu(page, text) { const row = page.locator(".message-row").filter({ hasText: text }).last(); await row.hover(); await row.getByRole("button", { name: /Message options:/ }).click(); return row; }
async function attachment(page, type) { await page.getByRole("button", { name: "Attach", exact: true }).click(); await page.getByRole("menuitem", { name: type, exact: true }).click(); }

test("desktop chat: send, quote, react, star and jump from saved messages", async ({ page }) => {
  const errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (/graph\.facebook\.com|\/api\//.test(r.url())) requests.push(r.url()); });
  await open(page);
  await expect(page.getByText("Interactive demo", { exact: true })).toBeVisible();
  for (const label of ["Broadcast", "Pipeline", "Marketing"]) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  await send(page, "Browser test: hello 👋");
  await messageMenu(page, "Perfect! See you then"); await page.getByRole("menuitem", { name: "Reply", exact: true }).click();
  await expect(page.locator(".reply-draft")).toContainText("Neha"); await send(page, "Quoted reply from the browser");
  await expect(page.locator(".message-row").filter({ hasText: "Quoted reply from the browser" }).last().locator(".quoted-message")).toContainText("Perfect!");
  await messageMenu(page, "Quoted reply from the browser"); await page.getByRole("menuitem", { name: "React", exact: true }).click(); await page.getByRole("button", { name: "React 👍", exact: true }).click();
  await expect(page.locator(".message-row").filter({ hasText: "Quoted reply from the browser" }).last().locator(".reaction-pill")).toContainText("👍");
  await messageMenu(page, "Quoted reply from the browser"); await page.getByRole("menuitem", { name: "Star message", exact: true }).click();
  await page.getByRole("button", { name: "Starred messages", exact: true }).click(); await expect(page.locator(".result-open").filter({ hasText: "Quoted reply from the browser" })).toBeVisible();
  await page.locator(".result-open").filter({ hasText: "Quoted reply from the browser" }).click(); await expect(page.getByRole("button", { name: "Jump to latest messages" })).toBeVisible(); await page.getByRole("button", { name: "Jump to latest messages" }).click();
  expect(errors).toEqual([]); expect(requests).toEqual([]);
});

test("contact info: workspace notes, mute, media gallery and settings", async ({ page }) => {
  await open(page); await page.locator(".thread-person").click();
  await expect(page.getByRole("complementary", { name: "Contact info" })).toBeVisible();
  await page.getByRole("switch", { name: "Mute chat", exact: true }).click(); await expect(page.getByRole("switch", { name: "Mute chat", exact: true })).toBeChecked();
  await page.getByLabel("Workspace contact note").fill("Shared workspace browser-test note"); await page.getByRole("button", { name: "Save note", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Workspace note saved");
  await page.getByRole("button", { name: "Media, links & documents" }).click(); await expect(page.locator(".gallery-tile")).toHaveCount(1);
  await page.locator(".gallery-tile").first().click(); await expect(page.getByRole("dialog", { name: "Photo viewer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close photo viewer" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Download photo" })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "Close photo viewer" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Photo viewer" })).toHaveCount(0);
  await expect(page.locator(".gallery-tile").first()).toBeFocused();
  await page.getByRole("button", { name: "Close shared media" }).click(); await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "sage wallpaper", exact: true }).click(); await expect(page.locator(".message-area")).toHaveClass(/wallpaper-sage/);
  await page.getByLabel("Message size").selectOption("large"); await expect(page.locator(".thread")).toHaveClass(/font-large/);
  await page.getByLabel("Your saved replies").fill("Saved reply one\nSaved reply two"); await page.getByRole("button", { name: "Save quick replies", exact: true }).click(); await page.getByRole("button", { name: "Back from settings" }).click();
  await page.getByRole("button", { name: "Quick replies", exact: true }).click(); await page.getByRole("button", { name: "Saved reply one" }).click(); await expect(composer(page)).toHaveValue("Saved reply one");
});

test("attachments, native-shaped location and contact sharing", async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent("filechooser"); await attachment(page, "Document"); const file = await chooser;
  await file.setFiles({ name: "browser-notes.txt", mimeType: "text/plain", buffer: Buffer.from("A small test document") });
  await page.getByLabel("Caption (optional)").fill("Notes attached"); await page.getByRole("dialog").getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".document-card").filter({ hasText: "browser-notes.txt" })).toBeVisible();
  await attachment(page, "Location"); await page.getByLabel("Latitude", { exact: true }).fill("19.1"); await page.getByLabel("Longitude", { exact: true }).fill("74.7"); await page.getByLabel("Place name (optional)").fill("Browser test meeting spot"); await page.getByRole("button", { name: "Send location", exact: true }).click(); await expect(page.locator(".location-card")).toContainText("Browser test meeting spot");
  await attachment(page, "Contact"); const dialog = page.getByRole("dialog"); await dialog.getByLabel("Name", { exact: true }).fill("Shared friend"); await dialog.getByLabel("Phone number", { exact: true }).fill("+1 202 555 0123"); await dialog.getByRole("button", { name: "Share contact", exact: true }).click(); await expect(page.locator(".contact-card")).toContainText("Shared friend");
});

test("voice recording can be reviewed and sent", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]); await open(page);
  await page.getByRole("button", { name: "Record voice message" }).click(); await expect(page.getByRole("button", { name: "Stop and review voice note" })).toBeVisible();
  await expect(page.locator(".recording-bar strong")).toHaveText("0:01", { timeout: 5000 }); await page.getByRole("button", { name: "Stop and review voice note" }).click();
  await expect(page.getByRole("dialog", { name: "Review voice note" })).toBeVisible(); await page.getByRole("dialog").getByRole("button", { name: "Send", exact: true }).click(); await expect(page.locator(".audio-message")).toContainText("Voice message");
});

test("forwarding, message search, delete-for-me and export", async ({ page }) => {
  await open(page); await send(page, "Forward this browser message"); await messageMenu(page, "Forward this browser message"); await page.getByRole("menuitem", { name: "Forward", exact: true }).click();
  await page.locator(".recipient-list > button").filter({ hasText: "Arjun Deshmukh" }).click(); await page.getByRole("dialog").getByRole("button", { name: "Forward", exact: true }).click();
  await page.locator(".chat-open").filter({ hasText: "Arjun Deshmukh" }).click(); await expect(page.locator(".message-row").filter({ hasText: "Forward this browser message" })).toContainText("Forwarded in this app");
  await page.getByRole("button", { name: "Search this conversation" }).click(); await page.getByRole("textbox", { name: "Search message text" }).fill("Forward this"); await expect(page.locator(".result-open")).toHaveCount(1); await page.locator(".result-open").click(); await page.getByRole("button", { name: "Jump to latest messages" }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Conversation menu", exact: true }).click(); await page.getByRole("menuitem", { name: "Export chat text", exact: true }).click(); expect((await download).suggestedFilename()).toContain("chat-");
  await messageMenu(page, "Forward this browser message"); await page.getByRole("menuitem", { name: "Delete for me", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Delete for me", exact: true }).click(); await expect(page.locator(".message-row").filter({ hasText: "Forward this browser message" })).toHaveCount(0);
});

test("mobile: reactions, back navigation, archive and reply-window safeguards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await messageMenu(page, "Perfect! See you then"); await page.getByRole("menuitem", { name: "React", exact: true }).click(); await page.getByRole("button", { name: "React 👍", exact: true }).click();
  await expect(page.locator(".message-row").filter({ hasText: "Perfect! See you then" }).locator(".reaction-pill")).toContainText("👍");
  await page.getByRole("button", { name: "Back to chat list" }).click(); await expect(page.getByRole("heading", { name: "Chats", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chat options for Aai", exact: true }).click(); await page.getByRole("menuitem", { name: "Archive chat", exact: true }).click(); await page.getByRole("button", { name: "Archived", exact: true }).click(); await expect(page.locator(".chat-open").filter({ hasText: "Aai" })).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click(); await page.locator(".chat-open").filter({ hasText: "Tanvi Shah" }).click(); await expect(page.locator(".conversation-window-note")).toHaveClass(/closed/); await composer(page).fill("This must stay a draft"); await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Use approved template", exact: true }).click(); await page.getByLabel("Approved template", { exact: true }).selectOption("demo_greeting|en"); await page.getByLabel("Body variable {{1}}").fill("Tanvi"); await page.getByRole("button", { name: "Send approved template", exact: true }).click(); await expect(page.locator(".message-row").filter({ hasText: "Template: demo_greeting" })).toBeVisible(); await expect(page.locator(".conversation-window-note")).toHaveClass(/closed/);
});
