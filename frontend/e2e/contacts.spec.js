import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

async function openBook(page) {
  await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible();
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Contacts", exact: true })).toBeVisible();
  await expect(page.locator(".directory-contact")).toHaveCount(7);
}
async function upload(page, name, text) {
  const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: /Choose a contacts file/ }).click();
  await (await chooser).setFiles({ name, mimeType: name.endsWith(".csv") ? "text/csv" : "text/vcard", buffer: Buffer.from(text, "utf8") });
  await expect(page.getByRole("button", { name: "Preview import", exact: true })).toBeEnabled();
}
async function downloadText(page, action) { const download = page.waitForEvent("download"); await action(); return fs.readFile(await (await download).path(), "utf8"); }

test("contacts: add one, search notes, edit, export and explicitly open a chat", async ({ page }) => {
  const errors = [], requests = []; page.on("pageerror", e => errors.push(e.message)); page.on("request", r => { if (/graph\.facebook\.com|\/api\//.test(r.url())) requests.push(r.url()); });
  await openBook(page); await page.getByRole("button", { name: "Add contact", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add contact", exact: true });
  await editor.getByLabel("Contact name", { exact: true }).fill("New browser friend"); await editor.getByLabel("Phone number", { exact: true }).fill("+91 90000 01001"); await editor.getByLabel("Workspace contact note").fill("Unique searching note");
  await editor.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page.locator(".directory-contact").filter({ hasText: "New browser friend" })).toBeVisible();
  await expect(page.locator(".chat-open").filter({ hasText: "New browser friend" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search contacts", exact: true }).fill("Unique searching note"); await expect(page.locator(".directory-contact")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit contact New browser friend", exact: true }).click();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByLabel("Contact name", { exact: true }).fill("Edited browser friend"); await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const text = await downloadText(page, () => page.getByRole("button", { name: "Export contacts", exact: true }).click()); expect(text).toContain("Edited browser friend"); expect(text).toContain("'+919000001001"); expect(text).not.toContain("Neha Patil");
  await page.getByRole("button", { name: "Open chat with Edited browser friend", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator(".thread-person")).toContainText("Edited browser friend");
  await expect(page.locator(".conversation-window-note")).toHaveClass(/closed/); await expect(page.getByRole("button", { name: "Record voice message" })).toBeDisabled();
  await expect(page.locator(".message-row")).toHaveCount(0); expect(errors).toEqual([]); expect(requests).toEqual([]);
});

test("contacts CSV: explicit preview, invalid rows, duplicates, import and persistence without sending", async ({ page }) => {
  await openBook(page); await page.getByRole("button", { name: "Import contacts", exact: true }).click();
  await upload(page, "friends.csv", "Name,Phone,Notes\nनवीन मित्र,+919000001102,नमस्कार\nRepeated,9000001102,Duplicate\nExisting,+919000000001,Do not overwrite\nInvalid,9.190E+11,Bad Excel number\nInternational,+12025550123,Friend abroad");
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await expect(page.locator('tr[data-action="create"]')).toHaveCount(2); await expect(page.locator('tr[data-action="skip"]')).toHaveCount(1); await expect(page.locator('tr[data-action="duplicate"]')).toHaveCount(1); await expect(page.locator('tr[data-action="invalid"]')).toHaveCount(1);
  const report = await downloadText(page, () => page.getByRole("button", { name: "Download row report", exact: true }).click()); expect(report).toContain("Invalid"); expect(report).toContain("scientific notation");
  await page.getByRole("button", { name: "Import 2 contacts", exact: true }).click(); await expect(page.locator(".contact-import-result")).toContainText("2 added");
  await page.getByRole("button", { name: "View contacts", exact: true }).click(); await expect(page.locator(".directory-contact")).toHaveCount(9); await expect(page.locator(".directory-contact").filter({ hasText: "नवीन मित्र" })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click(); await expect(page.locator(".chat-open").filter({ hasText: "नवीन मित्र" })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await page.getByRole("button", { name: "Contacts", exact: true }).click(); await expect(page.locator(".directory-contact")).toHaveCount(9);
});

test("contacts VCF: multiple phone entries and opt-in updating existing details", async ({ page }) => {
  await openBook(page); await page.getByRole("button", { name: "Import contacts", exact: true }).click();
  await upload(page, "phone-export.vcf", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Updated Neha\r\nTEL;TYPE=CELL:+919000000001\r\nNOTE:Updated workspace note\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nFN:Two-number friend\r\nTEL;VALUE=uri:tel:+919000001201\r\nTEL;TYPE=HOME:+12025550123\r\nEND:VCARD\r\n");
  await page.getByRole("button", { name: "Preview import", exact: true }).click(); await expect(page.locator('tr[data-action="skip"]')).toHaveCount(1);
  await page.getByLabel("If a number is already saved").selectOption("update"); await expect(page.locator(".contact-preview-table")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview import", exact: true }).click(); await expect(page.locator('tr[data-action="update"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Import 3 contacts", exact: true }).click(); await expect(page.locator(".contact-import-result")).toContainText("2 added"); await expect(page.locator(".contact-import-result")).toContainText("1 updated");
  await page.getByRole("button", { name: "View contacts", exact: true }).click(); const updated = page.locator(".directory-contact").filter({ hasText: "Updated Neha" }); await expect(updated).toContainText("Updated workspace note");
  await updated.getByRole("button", { name: "Open chat with Updated Neha" }).click(); await expect(page.locator(".conversation-window-note")).toHaveClass(/open/); await expect(page.locator(".message-row")).toHaveCount(10);
});

test("contacts: selected export and confirmed shared removal preserve existing chat history", async ({ page }) => {
  await openBook(page); await page.getByRole("checkbox", { name: "Select contact Neha Patil", exact: true }).check(); await page.getByRole("checkbox", { name: "Select contact Arjun Deshmukh", exact: true }).check();
  const text = await downloadText(page, () => page.getByRole("button", { name: "Export selected", exact: true }).click()); expect(text).toContain("Neha Patil"); expect(text).toContain("Arjun Deshmukh"); expect(text).not.toContain("Tanvi Shah");
  await page.getByRole("button", { name: "Remove selected", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("all workspace users"); await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.locator(".directory-contact")).toHaveCount(7);
  await page.getByRole("button", { name: "Remove selected", exact: true }).click(); await page.getByRole("button", { name: "Remove from contacts", exact: true }).click(); await expect(page.locator(".directory-contact")).toHaveCount(5);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click(); await expect(page.locator(".message-row")).toHaveCount(10); await expect(page.locator(".thread-person")).not.toContainText("Neha Patil");
  await page.getByRole("button", { name: "Contacts", exact: true }).click(); await page.getByRole("button", { name: "Add contact", exact: true }).click(); await page.getByLabel("Contact name", { exact: true }).fill("Saved again"); await page.getByLabel("Phone number", { exact: true }).fill("+919000000001"); await page.getByRole("button", { name: "Save contact", exact: true }).click(); await expect(page.locator(".directory-contact")).toHaveCount(6);
});

test("mobile contacts: menu entry, single creation, VCF import and no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); await expect(page.getByRole("textbox", { name: "Type a message" })).toBeVisible(); await page.getByRole("button", { name: "Back to chat list" }).click();
  await page.getByRole("button", { name: "Chat list menu" }).click(); await page.getByRole("menuitem", { name: "Manage contacts", exact: true }).click(); await expect(page.locator(".directory-contact")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Add contact", exact: true }).click(); await page.getByLabel("Contact name", { exact: true }).fill("Mobile friend"); await page.getByLabel("Phone number", { exact: true }).fill("+919000001301"); await page.getByRole("button", { name: "Save contact", exact: true }).click(); await expect(page.locator(".directory-contact").filter({ hasText: "Mobile friend" })).toBeVisible();
  await page.getByRole("button", { name: "Import contacts", exact: true }).click(); await upload(page, "mobile.vcf", "BEGIN:VCARD\nVERSION:3.0\nFN:Mobile imported\nTEL:+919000001302\nEND:VCARD"); await page.getByRole("button", { name: "Preview import", exact: true }).click(); await page.getByRole("button", { name: "Import 1 contact", exact: true }).click(); await page.getByRole("button", { name: "View contacts", exact: true }).click();
  await expect(page.locator(".directory-contact")).toHaveCount(9); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
});
