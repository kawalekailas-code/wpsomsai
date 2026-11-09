import Contact from "../models/Contact.js";
import { HttpError, normalizePhone } from "../lib/utils.js";

export const IMPORT_LIMIT = 500;
export function contactFields(input, { partial = false } = {}) {
  const fields = {};
  for (const [key, max] of [["name", 100], ["notes", 2000]]) {
    if (partial && !Object.hasOwn(input, key)) continue;
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > max || /\x00/.test(value)) throw new HttpError(400, `${key === "name" ? "Name" : "Notes"} must be text, up to ${max} characters.`);
    fields[key] = value.trim();
  }
  return fields;
}
export function contactPhone(input) {
  if (typeof input !== "string" || input.length > 60) throw new HttpError(400, "Use a phone number as text, including its country code.");
  let value = input.trim().replace(/^'(?=[+\d])/, "");
  if (!/^\+?[\d\s().-]+$/.test(value)) throw new HttpError(400, "Invalid phone number. Use digits and a country code; scientific notation and extensions are not supported.");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  return normalizePhone(value);
}
export const contactRecord = c => ({ _id: c._id, phone: c.phone, name: c.name || "", notes: c.notes || "", isSaved: c.isSaved !== false, chatStarted: c.chatStarted !== false, createdAt: c.createdAt });
export const safeCsvCell = value => {
  let text = String(value ?? "");
  // Treat numbers beginning with + as text too. Never export a spreadsheet formula.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export async function previewContactImport(input) {
  const entries = input?.contacts, mode = input?.duplicateMode || "skip";
  if (!["skip", "update"].includes(mode)) throw new HttpError(400, "Choose skip or update for existing contacts.");
  if (!Array.isArray(entries) || !entries.length || entries.length > IMPORT_LIMIT) throw new HttpError(400, `Import between 1 and ${IMPORT_LIMIT} phone entries at a time.`);
  const seen = new Set();
  const rows = entries.map((entry, index) => {
    const row = { index, row: Number.isSafeInteger(entry?.row) && entry.row > 0 ? entry.row : index + 1, name: typeof entry?.name === "string" ? entry.name.slice(0, 110) : "", phone: typeof entry?.phone === "string" ? entry.phone.slice(0, 80) : "", notes: typeof entry?.notes === "string" ? entry.notes.slice(0, 2010) : "" };
    try {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new HttpError(400, "Invalid contact row.");
      Object.assign(row, contactFields(entry)); row.phone = contactPhone(entry.phone);
      if (seen.has(row.phone)) return { ...row, action: "duplicate", error: "Repeated number in this file; the first valid occurrence wins." };
      seen.add(row.phone); return { ...row, action: "create" };
    } catch (err) { return { ...row, action: "invalid", error: err.message }; }
  });
  const existing = new Map((await Contact.find({ phone: { $in: [...seen] } }).select("phone name notes isSaved").lean()).map(c => [c.phone, c]));
  for (const row of rows) {
    if (row.action !== "create") continue;
    const c = existing.get(row.phone);
    if (c) { row.action = c.isSaved === false ? "restore" : mode === "skip" ? "skip" : "update"; row.existingName = c.name || ""; }
  }
  const summary = { total: rows.length, create: 0, restore: 0, update: 0, skip: 0, duplicate: 0, invalid: 0 };
  for (const row of rows) summary[row.action]++;
  return { rows, summary, duplicateMode: mode };
}

export async function applyContactImport(input) {
  // Revalidate against the current database; never trust preview statuses from a browser.
  const plan = await previewContactImport(input);
  const candidates = plan.rows.filter(r => ["create", "restore", "update"].includes(r.action));
  const report = { created: 0, restored: 0, updated: 0, skipped: plan.summary.skip, duplicates: plan.summary.duplicate, invalid: plan.summary.invalid, failed: 0 };
  if (!candidates.length) return { ...report, total: plan.rows.length };
  const operations = candidates.map(row => {
    const changes = { isSaved: true };
    // Blank imported fields never erase an existing contact's name/notes.
    if (row.name) changes.name = row.name;
    if (row.notes) changes.notes = row.notes;
    return { updateOne: {
      filter: { phone: row.phone, ...(plan.duplicateMode === "skip" ? { isSaved: false } : {}) },
      update: { $set: changes, $setOnInsert: { phone: row.phone, chatStarted: false, lastActivityAt: new Date() } }, upsert: true
    } };
  });
  let result, errors = [];
  try { result = await Contact.bulkWrite(operations, { ordered: false }); }
  catch (err) {
    if (!err.result || !Array.isArray(err.writeErrors)) throw new HttpError(503, "The import result could not be confirmed. Refresh contacts and preview again with skip-duplicates before retrying.");
    result = err.result; errors = err.writeErrors;
  }
  const failures = new Map(errors.map(e => [e.index ?? e.err?.index, e.code ?? e.err?.code]));
  const inserted = new Set(Object.keys(result.upsertedIds || {}).map(Number));
  candidates.forEach((row, i) => {
    if (failures.has(i)) { if (failures.get(i) === 11000) report.skipped++; else report.failed++; }
    else if (inserted.has(i)) report.created++;
    else if (row.action === "restore") report.restored++;
    else report.updated++;
  });
  return { ...report, total: plan.rows.length };
}
