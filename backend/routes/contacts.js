import express from "express";
import { once } from "node:events";
import { rateLimit } from "express-rate-limit";
import Contact from "../models/Contact.js";
import ChatState from "../models/ChatState.js";
import { asyncRoute, cleanText, escapeRegex, HttpError, limitOf, normalizePhone } from "../lib/utils.js";
import { applyContactImport, contactFields, contactPhone, contactRecord, previewContactImport, safeCsvCell } from "../services/contacts.js";

const router = express.Router();
const importLimit = rateLimit({ windowMs: 60000, limit: 20, keyGenerator: req => String(req.user._id), standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Please wait a minute before another contact import/preview." } });
function bookQuery(q) {
  const query = { isSaved: { $ne: false } };
  const text = cleanText(q, 100);
  if (text) query.$or = ["name", "phone", "notes"].map(key => ({ [key]: { $regex: escapeRegex(text), $options: "i" } }));
  return query;
}
function selectedPhones(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new HttpError(400, "Select between 1 and 100 contacts.");
  return [...new Set(input.map(contactPhone))];
}
router.get("/contact-book", asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1)), limit = limitOf(req.query.limit, 50);
  const query = bookQuery(req.query.q);
  const [contacts, total, allTotal] = await Promise.all([
    Contact.find(query).sort({ name: 1, phone: 1 }).collation({ locale: "en", strength: 2 }).skip((page - 1) * limit).limit(limit).lean(),
    Contact.countDocuments(query), Contact.countDocuments({ isSaved: { $ne: false } })
  ]);
  res.json({ contacts: contacts.map(contactRecord), total, allTotal, page, hasMore: page * limit < total });
}));
router.post("/contact-book/import/preview", importLimit, asyncRoute(async (req, res) => res.json(await previewContactImport(req.body))));
router.post("/contact-book/import", importLimit, asyncRoute(async (req, res) => {
  const report = await applyContactImport(req.body);
  if (report.created || report.restored || report.updated) req.io?.emit("chat:update", {});
  res.json(report);
}));
router.post("/contact-book/remove", asyncRoute(async (req, res) => {
  const phones = selectedPhones(req.body.phones);
  const result = await Contact.updateMany({ phone: { $in: phones }, isSaved: { $ne: false } }, { $set: { isSaved: false, name: "", notes: "" } });
  req.io?.emit("chat:update", {});
  res.json({ removed: result.modifiedCount });
}));
router.post("/contact-book/export", asyncRoute(async (req, res) => {
  const query = req.body.phones ? { isSaved: { $ne: false }, phone: { $in: selectedPhones(req.body.phones) } } : bookQuery(req.body.q);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="omsai-contacts.csv"');
  res.setHeader("Cache-Control", "private, no-store");
  res.write('\ufeff"Name","Phone","Notes"\r\n');
  const cursor = Contact.find(query).select("name phone notes").sort({ name: 1, phone: 1 }).lean().cursor({ batchSize: 100 });
  try {
    for await (const c of cursor) {
      if (res.destroyed) break;
      const row = [c.name, `+${c.phone}`, c.notes].map(safeCsvCell).join(",") + "\r\n";
      if (!res.write(row)) {
        const controller = new AbortController();
        try { await Promise.race([once(res, "drain", { signal: controller.signal }), once(res, "close", { signal: controller.signal })]); }
        finally { controller.abort(); }
      }
    }
    if (!res.destroyed) res.end();
  } finally { await cursor.close(); }
}));
router.post("/contact-book/:phone/open-chat", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const c = await Contact.findOne({ phone });
  if (!c) throw new HttpError(404, "Contact not found.");
  if (c.chatStarted === false) { c.chatStarted = true; c.lastActivityAt = new Date(); await c.save(); }
  await ChatState.updateOne({ userId: req.user._id, phone }, { $unset: { hiddenAt: 1 } });
  req.io?.emit("chat:update", { phone });
  res.json({ success: true });
}));
router.post("/contacts", asyncRoute(async (req, res) => {
  const phone = contactPhone(req.body.phone), fields = contactFields(req.body);
  if (req.body.startChat !== undefined && typeof req.body.startChat !== "boolean") throw new HttpError(400, "Invalid startChat value.");
  const startChat = req.body.startChat !== false;
  let contact = await Contact.findOne({ phone });
  if (contact && contact.isSaved !== false && !startChat) throw new HttpError(409, "This number is already saved. Search Contacts to edit it.", "CONTACT_EXISTS");
  let created = false;
  if (!contact) { contact = await Contact.create({ phone, ...fields, isSaved: true, chatStarted: startChat, lastActivityAt: new Date() }); created = true; }
  else {
    if (contact.isSaved === false) { Object.assign(contact, fields); contact.isSaved = true; }
    if (startChat && contact.chatStarted === false) { contact.chatStarted = true; contact.lastActivityAt = new Date(); }
    await contact.save();
  }
  if (startChat) await ChatState.updateOne({ userId: req.user._id, phone }, { $unset: { hiddenAt: 1 } });
  req.io?.emit("chat:update", { phone });
  res.status(created ? 201 : 200).json({ ...contactRecord(contact), lastInboundAt: contact.lastInboundAt, lastActivityAt: contact.lastActivityAt, hasUnread: false });
}));
router.patch("/contacts/:phone", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  if (Object.hasOwn(req.body, "phone") && contactPhone(req.body.phone) !== phone) throw new HttpError(400, "A phone number identifies its chat and cannot be changed. Add a new contact for a different number.");
  const fields = contactFields(req.body, { partial: true });
  if (!Object.keys(fields).length) throw new HttpError(400, "Provide a contact name or note to update.");
  const contact = await Contact.findOneAndUpdate({ phone }, { $set: fields }, { returnDocument: "after", runValidators: true });
  if (!contact) throw new HttpError(404, "Contact not found.");
  req.io?.emit("chat:update", { phone });
  res.json({ success: true, contact: contactRecord(contact) });
}));
export default router;
