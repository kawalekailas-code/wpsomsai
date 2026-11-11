import { describe, it, expect } from "vitest";
import { contactCsv, demoContactPreview, normalizeContactPhone, parseContactCsv, parseContactVCard, readContactFile } from "../lib/contact-files.js";
import { makeDemoService } from "../lib/demo.js";
const memory = () => { const m = new Map(); return { getItem: k => m.get(k), setItem: (k, v) => m.set(k, v) }; };
const file = (name, text, size) => { const b = new TextEncoder().encode(text); return { name, size: size ?? b.length, arrayBuffer: async () => b.buffer }; };

describe("safe CSV and vCard contacts parsing", () => {
  it("reads UTF-8, commas, escaped quotes, multiline notes and country-code text", () => {
    const rows = parseContactCsv('\ufeffName,Phone,Notes\r\n"नेहा, पाटील",\'+919876543210,"A \"\"quoted\"\" note\nSecond line"\r\n');
    expect(rows).toEqual([{ row: 2, name: "नेहा, पाटील", phone: "+919876543210", notes: 'A "quoted" note\nSecond line' }]);
  });
  it("accepts semicolon/tab separators and Google Contacts multiple-number columns", () => {
    expect(parseContactCsv("Name;Phone;Notes\nFriend;+12025550123;Hello")[0].phone).toBe("+12025550123");
    expect(parseContactCsv("Name\tMobile\nFriend\t9876543210")[0].phone).toBe("9876543210");
    const rows = parseContactCsv("Given Name,Family Name,Phone 1 - Value,Phone 2 - Value,Notes\nNeha,Patil,9876543210,+12025550123,Friend");
    expect(rows).toHaveLength(2); expect(rows[0].name).toBe("Neha Patil"); expect(rows[1].phone).toBe("+12025550123");
  });
  it("supports a phone-only CSV and retains empty-phone records for validation", () => {
    expect(parseContactCsv("Phone\n9876543210")[0].name).toBe("");
    expect(parseContactCsv("Name,Phone\nNo number,")[0].phone).toBe("");
  });
  it("rejects missing headers, malformed rows, unclosed quotes and over-limit batches", () => {
    expect(() => parseContactCsv("Person,Email\nFriend,a@example.com")).toThrow("No phone column");
    expect(() => parseContactCsv("Name,Phone\nWrong,9876543210,Extra")).toThrow("columns");
    expect(() => parseContactCsv('Name,Phone\n"Unclosed,9876543210')).toThrow("CSV could not be read");
    expect(() => parseContactCsv("Name,Phone\n")).toThrow("No contacts");
    expect(() => parseContactCsv("Name,Phone\n" + Array.from({ length: 501 }, (_, i) => `Friend ${i},9876543210`).join("\n"))).toThrow("500");
  });
  it("parses folded vCard 3.0 names, escaped notes and multiple numbers", () => {
    const rows = parseContactVCard("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Neha \r\n Patil\r\nTEL;TYPE=CELL:+919876543210\r\nitem1.TEL;TYPE=HOME:+12025550123\r\nNOTE:Hello\\, friend\\nSecond line\r\nPHOTO;ENCODING=b:ignored-binary\r\nEND:VCARD\r\n");
    expect(rows).toHaveLength(2); expect(rows[0].name).toBe("Neha Patil"); expect(rows[0].notes).toBe("Hello, friend\nSecond line"); expect(rows[1].phone).toBe("+12025550123");
    expect(Object.keys(rows[0]).sort()).toEqual(["name", "notes", "phone", "row"]);
  });
  it("decodes vCard 2.1 UTF-8 quoted-printable soft lines", () => {
    const rows = parseContactVCard("BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E0=A4=A8=E0=A5=87=\n=E0=A4=B9=E0=A4=BE\nTEL;CELL:9876543210\nEND:VCARD");
    expect(rows[0].name).toBe("नेहा");
  });
  it("handles vCard 4.0 tel URIs and N fallback without inventing phone numbers", () => {
    const rows = parseContactVCard("BEGIN:VCARD\nVERSION:4.0\nN:Patil;Neha;;;\nTEL;VALUE=uri:tel:%2B919876543210\nEND:VCARD\nBEGIN:VCARD\nFN:Missing phone\nEND:VCARD");
    expect(rows[0].name).toBe("Neha Patil"); expect(rows[0].phone).toBe("+919876543210"); expect(rows[1].phone).toBe("");
    expect(() => parseContactVCard("BEGIN:VCARD\nFN:Broken")).toThrow("missing END:VCARD");
    expect(() => parseContactVCard("BEGIN:VCARD\nBEGIN:VCARD\nEND:VCARD")).toThrow("Nested");
  });
  it("preserves escaped separators in structured vCard names", () => {
    const rows = parseContactVCard("BEGIN:VCARD\nVERSION:3.0\nN:Patil\\;More;Neha;;;\nTEL:+919876543210\nEND:VCARD");
    expect(rows[0].name).toBe("Neha Patil;More");
  });
  it("enforces file size, UTF-8 and explicit CSV/VCF extensions", async () => {
    expect(await readContactFile(file("friends.csv", "Name,Phone\nFriend,9876543210"))).toHaveLength(1);
    await expect(readContactFile(file("large.csv", "Name,Phone", 512 * 1024 + 1))).rejects.toThrow("512 KB");
    await expect(readContactFile(file("book.xlsx", "Name,Phone"))).rejects.toThrow(".xlsx");
    await expect(readContactFile({ name: "bad.csv", size: 2, arrayBuffer: async () => new Uint8Array([255, 254]).buffer })).rejects.toThrow("UTF-8");
  });
  it("normalizes India, international and 00-prefixed numbers; rejects spreadsheet/scientific garbage", () => {
    expect(normalizeContactPhone("98765 43210")).toBe("919876543210");
    expect(normalizeContactPhone("'+1 (202) 555-0123")).toBe("12025550123");
    expect(normalizeContactPhone("0091 91234 56789")).toBe("919123456789");
    for (const value of ["9.19E+11", "=1234567890", "+919876543210;ext=4", { $ne: null }, "123"]) expect(() => normalizeContactPhone(value)).toThrow();
  });
  it("CSV export prevents formula execution and round-trips quotes, +phones and notes", () => {
    const contacts = [{ name: '=HYPERLINK("unsafe")', phone: "919876543210", notes: "नमस्कार, friend\nSecond line" }, { name: "+Sum", phone: "12025550123", notes: "@formula" }];
    const csv = contactCsv(contacts); expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"'); expect(csv).toContain("'+919876543210");
    const rows = parseContactCsv(csv); expect(rows[0].name).toBe(contacts[0].name); expect(rows[0].notes).toBe(contacts[0].notes); expect(rows[1].notes).toBe("@formula");
  });
  it("previews duplicates, invalid records and update-vs-skip without mutation", () => {
    const old = [{ phone: "919876543210", name: "Saved" }, { phone: "12025550123", isSaved: false }];
    const input = { contacts: [{ phone: "9876543210", name: "New name" }, { phone: "+919876543210", name: "Duplicate" }, { phone: "+12025550123", name: "Restore" }, { phone: "bad" }, { phone: "+442079460123", notes: "New" }] };
    const preview = demoContactPreview(old, input); expect(preview.summary).toEqual({ total: 5, create: 1, restore: 1, update: 0, skip: 1, duplicate: 1, invalid: 1 });
    expect(demoContactPreview(old, { ...input, duplicateMode: "update" }).summary.update).toBe(1); expect(old[0].name).toBe("Saved");
  });
});

describe("contacts management demo parity", () => {
  it("adds one contact without creating a chat; opens chat only when explicitly requested", async () => {
    const api = makeDemoService({ storage: memory(), delay: 0 });
    const c = await api.addContact({ name: "New friend", phone: "+919000001001", notes: "Remember", startChat: false });
    expect((await api.contactBook({ q: "Remember" })).total).toBe(1);
    expect((await api.contacts()).contacts.some(x => x.phone === c.phone)).toBe(false);
    expect((await api.messages(c.phone)).messages).toHaveLength(0);
    await api.openContactChat(c.phone); expect((await api.contacts()).contacts.some(x => x.phone === c.phone)).toBe(true);
    await expect(api.sendText({ phone: c.phone, message: "Must not send" })).rejects.toThrow("24-hour");
  });
  it("imports, re-previews current duplicates, preserves blank fields and persists without sends", async () => {
    const storage = memory(), api = makeDemoService({ storage, delay: 0 });
    const input = { contacts: [{ name: "Renamed Neha", phone: "919000000001", notes: "" }, { name: "New friend", phone: "919000001002", notes: "New note" }] };
    await api.editContact("919000000001", { notes: "Keep this note" });
    expect((await api.previewContacts(input)).summary.create).toBe(1);
    const first = await api.importContacts(input); expect(first.created).toBe(1); expect(first.skipped).toBe(1);
    const second = await api.importContacts({ ...input, duplicateMode: "update" }); expect(second.updated).toBe(2); expect(second.created).toBe(0);
    expect((await api.contact("919000000001")).notes).toBe("Keep this note");
    expect((await api.messages("919000001002")).messages).toHaveLength(0);
    const reload = makeDemoService({ storage, delay: 0 }); expect((await reload.contactBook({ q: "New note" })).total).toBe(1);
  });
  it("removes shared saved details without clearing chats and can save a number again", async () => {
    const api = makeDemoService({ storage: memory(), delay: 0 }), phone = "919000000001";
    const before = (await api.messages(phone)).messages.length;
    await api.removeContacts([phone]); expect((await api.contactBook({ q: phone })).total).toBe(0);
    expect((await api.messages(phone)).messages).toHaveLength(before); expect((await api.contact(phone)).name).toBe("");
    await api.addContact({ name: "Saved again", phone, startChat: false }); expect((await api.contactBook({ q: phone })).total).toBe(1);
    expect((await api.messages(phone)).messages).toHaveLength(before);
  });
});
