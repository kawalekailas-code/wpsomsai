import { uid, messagePreview, formatTime } from "./chat.js";

const KEY = "omsai-personal-demo-v2";
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const defaults = { theme: "light", wallpaper: "doodle", fontSize: "medium", sound: true, desktopNotifications: false, enterToSend: true, quickReplies: ["Namaskar! 👋", "I'll get back to you shortly.", "Thank you! 🙏"] };
export function seedDemo(now = Date.now()) {
  const at = minutes => new Date(now - minutes * 60000).toISOString();
  const ids = ["919000000001", "919000000002", "919000000003", "919000000004", "919000000005", "919000000006", "919000000007"];
  const names = ["Neha Patil", "Arjun Deshmukh", "Aai", "Rohan Kulkarni", "Meera Joshi", "Tanvi Shah", "Aditya More"];
  const contacts = ids.map((phone, i) => ({ _id: `c${i}`, phone, name: names[i], notes: "", createdAt: at(10000), lastInboundAt: at(i === 5 ? 1600 : [2, 14, 32, 88, 200, 1600, 300][i]), lastActivityAt: at([2, 14, 32, 88, 200, 1600, 300][i]), pinned: i === 0 || i === 2, archived: i === 6, hasUnread: [0, 1, 2, 4].includes(i), mutedUntil: i === 3 ? new Date(now + 86400000).toISOString() : null }));
  let n = 0;
  const msg = (phone, direction, text, minutes, extra = {}) => {
    const id = `demo-${++n}`;
    return { _id: id, waMessageId: `wamid.demo.${id}`, phone, direction, type: "text", message: text, createdAt: at(minutes), updatedAt: at(minutes), status: direction === "outgoing" ? "seen" : "delivered", starred: false, reactions: { self: "", contact: "" }, ...extra };
  };
  const messages = [
    msg(ids[0], "incoming", "Hey! How's your day going? 😊", 105),
    msg(ids[0], "outgoing", "Hey Neha! Pretty good. Just finished my work for the day.", 103),
    msg(ids[0], "outgoing", "Are we still on for a little weekend getaway? 🌿", 102),
    msg(ids[0], "incoming", "Absolutely! A break is exactly what we need.", 99, { reactions: { self: "❤️", contact: "" } }),
    msg(ids[0], "incoming", "Look at this place I found!", 98),
    msg(ids[0], "incoming", "A little green escape 🌿", 97, { type: "image", media: true, mimeType: "image/svg+xml", filename: "weekend-inspiration.svg", caption: "A little green escape 🌿", demoUrl: "/demo/weekend.svg", mediaExpiresAt: at(-10080) }),
    msg(ids[0], "outgoing", "This looks beautiful. Let's go!", 92, { context: { messageId: "demo-6", message: "A little green escape 🌿", direction: "incoming", type: "image" }, starred: true }),
    msg(ids[0], "incoming", "Shall we meet at 6? I'll send the route before we leave.", 8),
    msg(ids[0], "outgoing", "6 works for me. I'll bring the snacks ☕", 5),
    msg(ids[0], "incoming", "Perfect! See you then 😊", 2),
    msg(ids[1], "incoming", "Sunday's pictures turned out so good 📷", 14),
    msg(ids[2], "incoming", "Ghari kadhi yetoy? Jevan tayar aahe ❤️", 32),
    msg(ids[3], "outgoing", "Got the notes. Thanks, Rohan!", 88),
    msg(ids[4], "incoming", "Coffee this weekend? My treat ☕", 200),
    msg(ids[5], "incoming", "Let's catch up soon!", 1600),
    msg(ids[6], "incoming", "Thanks for sharing the playlist 🎶", 300)
  ];
  return { version: 2, user: { _id: "demo-user", username: "kailas", displayName: "Kailas", about: "Enjoying the little things 🌿", role: "admin", preferences: defaults }, contacts, messages, states: {} };
}

export function makeDemoService({ storage = globalThis.localStorage, now = () => Date.now(), delay = 75 } = {}) {
  let data;
  try { data = JSON.parse(storage?.getItem(KEY)); } catch { /* fresh seed */ }
  if (!data || data.version !== 2) data = seedDemo(now());
  const listeners = new Set();
  const emit = (type, payload) => listeners.forEach(fn => fn(type, clone(payload)));
  const save = () => {
    try { storage?.setItem(KEY, JSON.stringify(data, (key, value) => key === "demoUrl" && typeof value === "string" && value.startsWith("blob:") ? undefined : value)); }
    catch { /* Large demo files stay only in this session. Production files use Meta media IDs. */ }
  };
  const wait = () => delay ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
  const result = async value => { await wait(); return clone(value); };
  const find = id => {
    const m = data.messages.find(m => m._id === id && !m.hidden);
    if (!m) throw new Error("Message not found.");
    return m;
  };
  const state = phone => data.states[phone] || {};
  const visible = phone => data.messages.filter(m => !m.hidden && (!phone || m.phone === phone) && (!state(m.phone).clearedAt || new Date(m.createdAt) > new Date(state(m.phone).clearedAt)));
  const view = c => {
    const s = state(c.phone);
    const last = visible(c.phone).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).at(-1);
    return { ...c, ...s, lastMessage: messagePreview(last), lastMessageAt: last?.createdAt, lastDirection: last?.direction, lastStatus: last?.status };
  };
  const phoneOf = input => {
    let value = String(input || "").replace(/\D/g, "");
    if (value.length === 10) value = `91${value}`;
    if (!/^[1-9]\d{7,14}$/.test(value)) throw new Error("Enter a valid phone number with its country code.");
    return value;
  };
  const checkWindow = phone => {
    const c = data.contacts.find(c => c.phone === phone);
    if (!c?.lastInboundAt || now() - new Date(c.lastInboundAt) >= 86400000) {
      const err = new Error("The 24-hour reply window is closed. Use an approved template, or ask the contact to message you."); err.code = "WINDOW_CLOSED"; throw err;
    }
  };
  async function send(input, fields, skipWindow = false) {
    const phone = phoneOf(input.phone);
    if (!skipWindow) checkWindow(phone);
    const previous = input.clientId && data.messages.find(m => m.clientId === input.clientId);
    if (previous) return result(previous);
    const source = input.replyToId ? find(input.replyToId) : null;
    if (source && source.phone !== phone) throw new Error("Reply must be in the same chat.");
    const id = uid();
    const at = new Date(Math.max(now(), new Date(state(phone).clearedAt || 0).getTime() + 1)).toISOString();
    const message = {
      _id: id, waMessageId: `wamid.demo.${id}`, clientId: input.clientId,
      phone, direction: "outgoing", createdAt: at, updatedAt: at, status: "delivered", type: "text", starred: false,
      reactions: { self: "", contact: "" }, ...(source ? { context: { messageId: source._id, message: messagePreview(source), type: source.type, direction: source.direction } } : {}), ...fields
    };
    data.messages.push(message);
    const c = data.contacts.find(c => c.phone === phone);
    if (c) c.lastActivityAt = at;
    if (data.states[phone]) delete data.states[phone].hiddenAt;
    save(); emit("message:new", { phone, id }); emit("chat:update", { phone });
    return result(message);
  }
  const cloneOrBlob = value => value instanceof Blob ? value : clone(value);
  let senderDemo;
  const sender = async () => senderDemo ||= (await import("./sender-demo.js")).makeSenderDemo({ getData: () => data, save, now, emit, sendMessage: (input, fields) => send(input, fields, true) });
  const service = {
    demo: true,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    checkSetup: () => result({ adminExists: true, setupAllowed: false }),
    me: () => result(data.user),
    config: () => result({ name: "OmSai Chat", connection: "demo", retentionDays: 30, incomingMediaDays: 7, outgoingMediaDays: 30, maxUploadMB: 16, voiceNotes: true, templatesAvailable: true, displayPhone: "+91 90000 00000" }),
    patchMe: async changes => {
      if (changes.displayName !== undefined) {
        if (!changes.displayName.trim()) throw new Error("Display name cannot be empty.");
        data.user.displayName = changes.displayName.trim().slice(0, 80);
      }
      if (changes.about !== undefined) data.user.about = changes.about.slice(0, 140);
      if (changes.preferences) data.user.preferences = { ...data.user.preferences, ...changes.preferences };
      save(); return result(data.user);
    },
    senderTemplates: async (...args) => cloneOrBlob(await (await sender()).senderTemplates(...args)),
    senderPreview: async (...args) => cloneOrBlob(await (await sender()).senderPreview(...args)),
    senderUpload: async (...args) => cloneOrBlob(await (await sender()).senderUpload(...args)),
    senderCreate: async (...args) => cloneOrBlob(await (await sender()).senderCreate(...args)),
    senderJobs: async (...args) => cloneOrBlob(await (await sender()).senderJobs(...args)),
    senderJob: async (...args) => cloneOrBlob(await (await sender()).senderJob(...args)),
    senderControl: async (...args) => cloneOrBlob(await (await sender()).senderControl(...args)),
    senderReview: async (...args) => cloneOrBlob(await (await sender()).senderReview(...args)),
    senderExport: async (...args) => cloneOrBlob(await (await sender()).senderExport(...args)),
    senderSuppression: async (...args) => cloneOrBlob(await (await sender()).senderSuppression(...args)),
    safetyHealth: async (...args) => cloneOrBlob(await (await sender()).safetyHealth(...args)),
    safetyEvents: async (...args) => cloneOrBlob(await (await sender()).safetyEvents(...args)),
    safetyEvent: async (...args) => cloneOrBlob(await (await sender()).safetyEvent(...args)),
    safetyRetry: async (...args) => cloneOrBlob(await (await sender()).safetyRetry(...args)),
    safetyAcknowledge: async (...args) => cloneOrBlob(await (await sender()).safetyAcknowledge(...args)),
    contacts: ({ q = "", filter = "all", page = 1, limit = 40 } = {}) => {
      const list = data.contacts.map(view).filter(c => c.chatStarted !== false && !c.hiddenAt && (filter === "archived" ? c.archived : !c.archived) && (filter !== "unread" || c.hasUnread) && [c.name, c.phone, c.lastMessage].some(v => String(v || "").toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
      return result({ contacts: list.slice((page - 1) * limit, page * limit), total: list.length, hasMore: page * limit < list.length, page });
    },
    contact: phone => {
      const c = data.contacts.find(c => c.phone === phone);
      if (!c) throw new Error("Contact not found.");
      return result(view(c));
    },
    addContact: async input => {
      const { normalizeContactPhone } = await import("./contact-files.js");
      const phone = normalizeContactPhone(input.phone), startChat = input.startChat !== false;
      const fields = { name: (input.name || "").trim(), notes: (input.notes || "").trim() };
      if (fields.name.length > 100 || fields.notes.length > 2000) throw new Error("Name or notes are too long.");
      let contact = data.contacts.find(c => c.phone === phone);
      if (contact && contact.isSaved !== false && !startChat) throw new Error("This number is already saved. Search Contacts to edit it.");
      if (!contact) {
        contact = { _id: uid(), phone, ...fields, isSaved: true, chatStarted: startChat, createdAt: new Date(now()).toISOString(), lastActivityAt: new Date(now()).toISOString(), pinned: false, archived: false, hasUnread: false };
        data.contacts.push(contact);
      } else {
        if (contact.isSaved === false) { Object.assign(contact, fields); contact.isSaved = true; }
        if (startChat && contact.chatStarted === false) { contact.chatStarted = true; contact.lastActivityAt = new Date(now()).toISOString(); }
      }
      if (startChat && data.states[phone]) delete data.states[phone].hiddenAt;
      save(); emit("chat:update", { phone }); return result(view(contact));
    },
    editContact: async (phone, input) => {
      const c = data.contacts.find(c => c.phone === phone); if (!c) throw new Error("Contact not found.");
      if (input.phone && phoneOf(input.phone) !== phone) throw new Error("The chat's phone number cannot be changed. Add a new contact instead.");
      if (input.name !== undefined) { if (typeof input.name !== "string" || input.name.length > 100) throw new Error("Name must be up to 100 characters."); c.name = input.name.trim(); }
      if (input.notes !== undefined) { if (typeof input.notes !== "string" || input.notes.length > 2000) throw new Error("Notes must be up to 2000 characters."); c.notes = input.notes.trim(); }
      save(); emit("chat:update", { phone }); return result({ success: true });
    },
    contactBook: ({ q = "", page = 1, limit = 50 } = {}) => {
      const all = data.contacts.filter(c => c.isSaved !== false);
      const list = all.filter(c => [c.name, c.phone, c.notes].some(v => String(v || "").toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.phone.localeCompare(b.phone));
      return result({ contacts: list.slice((page - 1) * limit, page * limit), total: list.length, allTotal: all.length, page, hasMore: page * limit < list.length });
    },
    previewContacts: async input => result((await import("./contact-files.js")).demoContactPreview(data.contacts, input)),
    importContacts: async input => {
      const { demoContactPreview } = await import("./contact-files.js");
      const preview = demoContactPreview(data.contacts, input);
      const report = { created: 0, restored: 0, updated: 0, skipped: preview.summary.skip, duplicates: preview.summary.duplicate, invalid: preview.summary.invalid, failed: 0, total: preview.rows.length };
      for (const r of preview.rows.filter(r => ["create", "restore", "update"].includes(r.action))) {
        let c = data.contacts.find(c => c.phone === r.phone);
        if (!c) { c = { _id: uid(), phone: r.phone, name: "", notes: "", chatStarted: false, hasUnread: false, archived: false, createdAt: new Date(now()).toISOString(), lastActivityAt: new Date(now()).toISOString() }; data.contacts.push(c); report.created++; }
        else if (r.action === "restore") report.restored++; else report.updated++;
        c.isSaved = true; if (r.name) c.name = r.name; if (r.notes) c.notes = r.notes;
      }
      save(); emit("chat:update", {}); return result(report);
    },
    removeContacts: async phones => {
      if (!Array.isArray(phones) || !phones.length || phones.length > 100) throw new Error("Select between 1 and 100 contacts.");
      const keys = phones.map(phoneOf); let removed = 0;
      for (const c of data.contacts) if (keys.includes(c.phone) && c.isSaved !== false) { c.isSaved = false; c.name = ""; c.notes = ""; removed++; }
      save(); emit("chat:update", {}); return result({ removed });
    },
    exportContacts: async ({ q = "", phones } = {}) => {
      const list = data.contacts.filter(c => c.isSaved !== false && (phones ? phones.includes(c.phone) : [c.name, c.phone, c.notes].some(v => String(v || "").toLowerCase().includes(q.toLowerCase()))));
      const { contactCsv } = await import("./contact-files.js");
      return new Blob([contactCsv(list)], { type: "text/csv;charset=utf-8" });
    },
    openContactChat: async phone => {
      const c = data.contacts.find(c => c.phone === phone); if (!c) throw new Error("Contact not found.");
      if (c.chatStarted === false) { c.chatStarted = true; c.lastActivityAt = new Date(now()).toISOString(); }
      if (data.states[phone]) delete data.states[phone].hiddenAt;
      save(); emit("chat:update", { phone }); return result({ success: true });
    },
    chatState: async (phone, changes) => {
      data.states[phone] = { ...state(phone), ...changes, ...(changes.manualUnread !== undefined ? { hasUnread: changes.manualUnread } : {}) };
      save(); emit("chat:state", { phone }); return result({ success: true });
    },
    readChat: async phone => {
      data.states[phone] = { ...state(phone), hasUnread: false, manualUnread: false };
      save(); return result({ success: true });
    },
    clearChat: async phone => {
      data.states[phone] = { ...state(phone), clearedAt: new Date(now()).toISOString(), hasUnread: false };
      data.messages.filter(m => m.phone === phone).forEach(m => { m.starred = false; });
      save(); emit("chat:cleared", { phone }); return result({ success: true });
    },
    deleteChat: async phone => {
      await service.clearChat(phone);
      data.states[phone].hiddenAt = new Date(now()).toISOString(); save(); emit("chat:update", { phone }); return result({ success: true });
    },
    messages: (phone, before, around) => {
      const all = visible(phone).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      let slice;
      if (around) { const index = all.findIndex(m => m._id === around); slice = all.slice(Math.max(0, index - 25), index + 26); }
      else { const end = before ? all.findIndex(m => m._id === before) : all.length; slice = all.slice(Math.max(0, end - 50), end); }
      return result({ syncCursor: new Date(now() - 1000).toISOString(), readThrough: new Date(now()).toISOString(), messages: slice, nextCursor: slice.length && all.indexOf(slice[0]) > 0 ? slice[0]._id : null, around: Boolean(around) });
    },
    syncMessages: async (phone, after) => result({ messages: visible(phone).filter(m => new Date(m.updatedAt || m.createdAt) >= new Date(after)), removed: data.messages.filter(m => m.phone === phone && m.hidden).map(m => m._id), clearedAt: state(phone).clearedAt || null, hasMore: false, syncCursor: new Date(now() - 1000).toISOString(), readThrough: new Date(now()).toISOString() }),
    message: id => result(find(id)),
    search: (q, phone) => result({ messages: visible(phone).filter(m => `${m.message || ""} ${m.caption || ""}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50) }),
    starred: before => {
      const list = visible().filter(m => m.starred).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const index = before ? list.findIndex(m => m._id === before) + 1 : 0;
      return result({ messages: list.slice(index, index + 50), nextCursor: list.length > index + 50 ? list[index + 49]._id : null });
    },
    gallery: (phone, kind = "media", before) => {
      const list = visible(phone).filter(m => kind === "links" ? /https?:\/\//.test(m.message || "") && !m.media : kind === "files" ? m.media && m.type === "document" : m.media && m.type !== "document").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const index = before ? list.findIndex(m => m._id === before) + 1 : 0;
      return result({ messages: list.slice(index, index + 12), nextCursor: list.length > index + 12 ? list[index + 11]._id : null });
    },
    starMessage: async (id, starred) => { find(id).starred = starred; save(); return result({ success: true, starred }); },
    deleteMessage: async id => { const m = find(id); m.hidden = true; m.starred = false; save(); emit("message:hidden", { phone: m.phone, id }); return result({ success: true }); },
    react: async (id, emoji) => { const m = find(id); checkWindow(m.phone); m.reactions = { ...m.reactions, self: emoji }; save(); emit("message:update", { phone: m.phone, id }); return result(m); },
    sendText: input => {
      if (!input.message?.trim() || input.message.length > 4096) throw new Error("Write a message between 1 and 4096 characters.");
      return send(input, { message: input.message.trim() });
    },
    sendMedia: async input => {
      if (input.file.size > 16 * 1024 * 1024) throw new Error("Files must be under 16 MB.");
      let url;
      if (input.file.size <= 1024 * 1024) {
        const bytes = new Uint8Array(await input.file.arrayBuffer());
        let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
        url = `data:${input.file.type};base64,${btoa(binary)}`;
      } else url = URL.createObjectURL(input.file);
      const type = input.kind === "sticker" ? "sticker" : input.file.type.startsWith("image/") ? "image" : input.file.type.startsWith("video/") ? "video" : input.file.type.startsWith("audio/") ? "audio" : "document";
      return send(input, { type, media: true, filename: input.file.name, message: input.caption || input.file.name, caption: input.caption || "", mimeType: input.file.type, voice: Boolean(input.voice), demoUrl: url, mediaExpiresAt: new Date(now() + 30 * 86400000).toISOString() });
    },
    sendLocation: input => {
      const latitude = Number(input.latitude), longitude = Number(input.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || input.latitude === "" || input.longitude === "") throw new Error("Enter valid coordinates.");
      return send(input, { type: "location", message: input.name || "Location", location: { latitude, longitude, name: input.name, address: input.address } });
    },
    sendContact: input => send(input, { type: "contacts", message: input.name, contacts: [{ name: input.name, phone: phoneOf(input.sharedPhone) }] }),
    forward: input => {
      const m = find(input.messageId);
      const fields = clone(m); for (const key of ["_id", "waMessageId", "clientId", "phone", "direction", "createdAt", "updatedAt", "context", "starred", "reactions", "hidden"]) delete fields[key];
      return send(input, { ...fields, forwarded: true });
    },
    templates: () => result({ templates: [{ name: "demo_greeting", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "Hello {{1}}, would you like to continue our conversation?" }] }], manualEntry: false }),
    sendTemplate: input => send(input, { type: "template", message: `Template: ${input.name}${input.parameters?.length ? ` · ${input.parameters.join(" · ")}` : ""}` }, true),
    media: async id => {
      const m = find(id); if (!m.demoUrl) throw new Error("This demo attachment was not retained. Upload it again.");
      return fetch(m.demoUrl).then(r => r.blob());
    },
    exportChat: async phone => new Blob([`OmSai Chat — DEMO export\nOnly app-visible messages; no attachment binaries.\n\n${visible(phone).map(m => `[${new Date(m.createdAt).toLocaleDateString("en-IN")} ${formatTime(m.createdAt)}] ${m.direction === "outgoing" ? "You" : "Contact"}: ${messagePreview(m)}`).join("\n")}`], { type: "text/plain" }),
    changePassword: async () => { throw new Error("Password changes are available only on a real signed-in account."); },
    resetDemo: async () => { data = seedDemo(now()); save(); return result(data.user); }
  };
  save();
  return service;
}
