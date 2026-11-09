import Papa from "papaparse";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export const MAX_CONTACT_FILE = 512 * 1024;
export const MAX_CONTACT_ROWS = 500;
const unprotect = value => String(value ?? "").replace(/^'(?=[\s\u0000-\u001f]*[=+@-])/, "").trim();
const key = value => String(value).replace(/^\ufeff/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function bounded(rows) {
  if (!rows.length) throw new Error("No contacts found. Include a phone column or TEL entries in your vCard.");
  if (rows.length > MAX_CONTACT_ROWS) throw new Error(`This file contains more than ${MAX_CONTACT_ROWS} phone entries. Split it into smaller files; nothing has been imported.`);
  return rows;
}
export function parseContactCsv(text) {
  const parsed = Papa.parse(text.replace(/^\ufeff/, ""), { skipEmptyLines: "greedy", dynamicTyping: false, delimitersToGuess: [",", ";", "\t"] });
  const errors = parsed.errors.filter(e => e.code !== "UndetectableDelimiter");
  if (errors.length) throw new Error(`CSV could not be read: ${errors[0].message}. Check quotes and save as UTF-8 CSV.`);
  const [headers, ...records] = parsed.data;
  if (!headers?.length) throw new Error("The CSV file is empty.");
  const columns = headers.map(key);
  const phoneIndexes = columns.map((v, i) => /^(phone|mobile|phonenumber|mobilenumber|number|tel|telephone|whatsapp|whatsappnumber|phone\d+value|mobilephone|homephone|workphone)$/.test(v) ? i : -1).filter(i => i >= 0);
  if (!phoneIndexes.length) throw new Error("No phone column found. Use Name, Phone, Notes headers, or Google Contacts CSV with Phone 1 - Value.");
  const column = names => columns.findIndex(c => names.includes(c));
  const nameIndex = column(["name", "fullname", "displayname"]), firstIndex = column(["firstname", "givenname"]), lastIndex = column(["lastname", "familyname", "surname"]), middleIndex = column(["middlename", "additionalname"]), notesIndex = column(["notes", "note", "comments"]);
  const rows = [];
  records.forEach((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV record ${index + 2} has ${cells.length} columns; expected ${headers.length}. Quote fields containing commas.`);
    const name = nameIndex >= 0 ? unprotect(cells[nameIndex]) : [cells[firstIndex], cells[middleIndex], cells[lastIndex]].map(v => unprotect(v)).filter(Boolean).join(" ");
    const notes = unprotect(cells[notesIndex]);
    const phones = phoneIndexes.map(i => unprotect(cells[i])).filter(Boolean);
    for (const phone of phones.length ? phones : [""]) rows.push({ row: index + 2, name, phone, notes });
  });
  return bounded(rows);
}
function decodeVCardValue(value, metadata, unescape = true) {
  const charset = /CHARSET=([^;:]+)/i.exec(metadata)?.[1]?.replace(/"/g, "") || "utf-8";
  try {
    if (/ENCODING=QUOTED-PRINTABLE/i.test(metadata)) {
      const bytes = [];
      for (let i = 0; i < value.length;) {
        if (value[i] === "=" && /^[\da-f]{2}$/i.test(value.slice(i + 1, i + 3))) { bytes.push(parseInt(value.slice(i + 1, i + 3), 16)); i += 3; }
        else { const char = String.fromCodePoint(value.codePointAt(i)); bytes.push(...new TextEncoder().encode(char)); i += char.length; }
      }
      value = new TextDecoder(charset, { fatal: true }).decode(Uint8Array.from(bytes));
    } else if (/ENCODING=(?:B|BASE64)(?:;|$)/i.test(metadata)) {
      const bytes = Uint8Array.from(atob(value), ch => ch.charCodeAt(0)); value = new TextDecoder(charset, { fatal: true }).decode(bytes);
    }
  } catch { throw new Error("This vCard uses unreadable name/notes encoding. Export it again using UTF-8."); }
  return unescape ? value.replace(/\\([nN,;\\])/g, (_, char) => char.toLowerCase() === "n" ? "\n" : char).trim() : value;
}
export function parseContactVCard(text) {
  const physical = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n"), lines = [];
  for (const [physicalIndex, raw] of physical.entries()) {
    const last = lines.at(-1);
    if (last && /ENCODING=QUOTED-PRINTABLE/i.test(last.text) && last.text.endsWith("=")) last.text = last.text.slice(0, -1) + raw.replace(/^[ \t]/, "");
    else if (/^[ \t]/.test(raw) && last) last.text += raw.slice(1);
    else lines.push({ text: raw, line: physicalIndex + 1 });
  }
  const rows = []; let card = null;
  for (const { text: line, line: lineNumber } of lines) {
    if (/^BEGIN:VCARD$/i.test(line.trim())) { if (card) throw new Error("Nested or unclosed vCard. Export the file again."); card = { phones: [], row: lineNumber }; continue; }
    if (/^END:VCARD$/i.test(line.trim())) {
      if (!card) throw new Error("Malformed vCard boundary.");
      const name = card.fn || card.n || "";
      for (const phone of card.phones.length ? card.phones : [""]) rows.push({ row: card.row, name, phone, notes: card.notes || "" });
      if (rows.length > MAX_CONTACT_ROWS) return bounded(rows);
      card = null; continue;
    }
    if (!card || !line) continue;
    let colon = -1, quoted = false;
    for (let i = 0; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; else if (line[i] === ":" && !quoted) { colon = i; break; } }
    if (colon < 0) continue;
    const metadata = line.slice(0, colon), property = metadata.split(";")[0].split(".").at(-1).toUpperCase();
    if (!["FN", "N", "TEL", "NOTE"].includes(property)) continue; // Never import photos, addresses, URLs or binary blobs.
    const rawValue = line.slice(colon + 1);
    const value = decodeVCardValue(rawValue, metadata);
    if (property === "FN") card.fn = value;
    if (property === "N") {
      const encoded = decodeVCardValue(rawValue, metadata, false), parts = []; let part = "";
      for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] === "\\" && i + 1 < encoded.length) part += encoded[i] + encoded[++i];
        else if (encoded[i] === ";") { parts.push(decodeVCardValue(part, "")); part = ""; }
        else part += encoded[i];
      }
      parts.push(decodeVCardValue(part, ""));
      card.n = [parts[3], parts[1], parts[2], parts[0], parts[4]].filter(Boolean).join(" ");
    }
    if (property === "NOTE") card.notes = value;
    if (property === "TEL") {
      let phone = value.replace(/^tel:/i, "");
      try { phone = decodeURIComponent(phone); } catch { /* Invalid URI becomes an invalid-number preview row. */ }
      card.phones.push(phone);
    }
  }
  if (card) throw new Error("The final vCard is missing END:VCARD. Nothing has been imported.");
  return bounded(rows);
}
export async function readContactFile(file) {
  if (!file) throw new Error("Choose a CSV or VCF file first.");
  if (file.size > MAX_CONTACT_FILE) throw new Error("Contact files must be no larger than 512 KB. Split larger exports first.");
  const bytes = await file.arrayBuffer(); let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Save/export this file as UTF-8 CSV or UTF-8 vCard before importing."); }
  if (/\.csv$/i.test(file.name)) return parseContactCsv(text);
  if (/\.vcf$/i.test(file.name)) return parseContactVCard(text);
  throw new Error("Use a .csv or .vcf file. Excel .xlsx files must first be exported as CSV UTF-8.");
}
export function normalizeContactPhone(input) {
  if (typeof input !== "string" || input.length > 60) throw new Error("Use a phone number as text, including its country code.");
  let value = input.trim().replace(/^'(?=[+\d])/, "");
  if (!/^\+?[\d\s().-]+$/.test(value)) throw new Error("Invalid phone number. Use digits and a country code; scientific notation and extensions are not supported.");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  const digits = value.replace(/\D/g, "");
  const number = parsePhoneNumberFromString(value.startsWith("+") ? value : digits.length === 10 ? value : `+${value}`, "IN");
  if (!number?.isPossible()) throw new Error("Enter a valid phone number with its country code.");
  return number.number.slice(1);
}
export function csvText(headers, rows) {
  const cell = value => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return "\ufeff" + [headers, ...rows].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function contactCsv(contacts) {
  return csvText(["Name", "Phone", "Notes"], contacts.map(c => [c.name, `+${c.phone}`, c.notes]));
}

// Browser-local preview for the explicitly fictional demo. The real backend
// independently validates every row and recomputes duplicates before writing.
export function demoContactPreview(contacts, input) {
  if (!Array.isArray(input.contacts) || !input.contacts.length || input.contacts.length > MAX_CONTACT_ROWS) throw new Error("Import between 1 and 500 phone entries at a time.");
  const mode = input.duplicateMode || "skip";
  if (!["skip", "update"].includes(mode)) throw new Error("Choose skip or update for existing contacts.");
  const seen = new Set(), existing = new Map(contacts.map(c => [c.phone, c]));
  const rows = input.contacts.map((c, index) => {
    const r = { index, row: c?.row || index + 1, name: c?.name || "", phone: c?.phone || "", notes: c?.notes || "" };
    try {
      if (typeof r.name !== "string" || r.name.length > 100 || typeof r.notes !== "string" || r.notes.length > 2000 || /\x00/.test(r.name + r.notes)) throw new Error("Name must be at most 100 and notes at most 2000 characters.");
      r.name = r.name.trim(); r.notes = r.notes.trim(); r.phone = normalizeContactPhone(c.phone);
      if (seen.has(r.phone)) return { ...r, action: "duplicate", error: "Repeated number in this file; the first valid occurrence wins." };
      seen.add(r.phone);
      const old = existing.get(r.phone);
      return { ...r, action: old ? old.isSaved === false ? "restore" : mode === "skip" ? "skip" : "update" : "create", ...(old ? { existingName: old.name || "" } : {}) };
    } catch (err) { return { ...r, action: "invalid", error: err.message }; }
  });
  const summary = { total: rows.length, create: 0, restore: 0, update: 0, skip: 0, duplicate: 0, invalid: 0 };
  for (const r of rows) summary[r.action]++;
  return { rows, summary, duplicateMode: mode };
}
