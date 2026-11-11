import { normalizeContactPhone, csvText } from "./contact-files.js";
import { uid } from "./chat.js";
const templates = [
  { name: "demo_greeting", language: "en", status: "APPROVED", header: "NONE", body: "Hello {{1}}, would you like to continue our conversation?", footer: "OmSai demo · fictional", params: ["1"], supported: true },
  { name: "demo_photo_update", language: "mr", status: "APPROVED", header: "IMAGE", body: "नमस्कार! ही तुमच्यासाठी एक अपडेट आहे.", footer: "Fictional template preview", params: [], supported: true },
  { name: "demo_video_update", language: "mr", status: "APPROVED", header: "VIDEO", body: "नमस्कार! हा आमचा नवीन व्हिडिओ.", params: [], supported: true }
];
export function makeSenderDemo({ getData, save, now, sendMessage, emit }) {
  const data = () => {
    const d = getData(); d.senderJobs ||= []; d.senderUploads ||= {};
    d.safetyEvents ||= [{ _id: "demo-captured-event", kind: "message", state: "attention", summary: "Fictional hidden-number sender · text", reason: "BSUID_ONLY: Captured for review; not a phone chat. Demo event already acknowledged.", attempts: 1, createdAt: new Date(now()).toISOString(), acknowledgedAt: new Date(now()).toISOString(), payload: { message: { id: "wamid.demo.hidden", from_user_id: "IN.FICTIONAL_DEMO_ONLY", type: "text", text: { body: "This is a fictional hidden-number message retained for review." } } } }];
    return d;
  };
  const preview = input => {
    let rows = input.source === "book" ? data().contacts.filter(c => c.isSaved !== false && [c.name, c.phone, c.notes].some(v => String(v || "").toLowerCase().includes((input.q || "").toLowerCase()))) : input.recipients;
    if (!rows?.length || rows.length > 5000) throw new Error("Choose between 1 and 5000 entries.");
    const seen = new Set();
    rows = rows.map((r, i) => {
      const row = { row: i + 1, name: r.name || "", phone: r.phone || "", action: "ready", reason: "" };
      try {
        row.phone = normalizeContactPhone(row.phone);
        if (seen.has(row.phone)) { row.action = "duplicate"; row.reason = "Repeated number in this selection."; }
        else if (data().contacts.find(c => c.phone === row.phone)?.doNotMessage) { row.action = "blocked"; row.reason = "Do-not-send / opt-out suppression."; }
        else if (data().senderJobs.some(j => j.recipients.some(r => r.phone === row.phone && r.state === "uncertain"))) { row.action = "blocked"; row.reason = "Earlier uncertain send requires review."; }
        seen.add(row.phone);
      } catch (err) { row.action = "invalid"; row.reason = err.message; }
      return row;
    });
    const summary = { total: rows.length, ready: 0, invalid: 0, duplicate: 0, blocked: 0 };
    rows.forEach(r => summary[r.action]++); return { rows, summary, source: input.source || "rows" };
  };
  const job = id => { const j = data().senderJobs.find(j => j._id === id); if (!j) throw new Error("Job not found."); return j; };
  const pub = j => { const { recipients, upload, parameters, requestId, ...p } = j; const counts = {}; recipients.forEach(r => { counts[r.state] = (counts[r.state] || 0) + 1; }); return { ...p, counts }; };
  async function advance(j) {
    if (!["queued", "running"].includes(j.state)) return;
    if (data().safetyEvents.some(e => ["failed", "pending"].includes(e.state) || e.state === "attention" && !e.acknowledgedAt)) { j.state = "paused"; j.pauseReason = "Review the captured incoming event first."; save(); return; }
    const r = j.recipients.find(r => r.state === "pending");
    if (r) {
      if (data().contacts.find(c => c.phone === r.phone)?.doNotMessage) { r.state = "cancelled"; r.error = "Opt-out suppression added after preview."; }
      else {
        let c = data().contacts.find(c => c.phone === r.phone);
        if (!c) { c = { _id: uid(), phone: r.phone, name: "", notes: "", isSaved: false, chatStarted: true, createdAt: new Date(now()).toISOString() }; data().contacts.push(c); }
        c.chatStarted = true;
        const m = await sendMessage({ phone: r.phone, clientId: `demo_tpl_${j._id}_${r.phone}` }, { type: "template", message: j.text, ...(j.upload ? { media: true, mediaKind: j.upload.type, caption: j.text, demoUrl: j.upload.demoUrl, filename: j.upload.filename, mimeType: j.upload.type === "image" ? "image/png" : "video/mp4" } : {}) });
        r.state = "delivered"; r.messageId = m._id; r.waMessageId = m.waMessageId; r.attempts = 1;
      }
      j.state = "running";
    }
    if (!j.recipients.some(r => r.state === "pending")) { j.state = j.recipients.some(r => r.state === "uncertain") ? "attention" : "completed"; j.completedAt = new Date(now()).toISOString(); }
    save();
  }
  return {
    senderTemplates: async () => ({ templates, maxRecipients: 5000, gapMs: 1000, workerEnabled: true }),
    senderPreview: async input => preview(input),
    senderUpload: async ({ file, name, language }) => {
      const t = templates.find(t => t.name === name && t.language === language);
      const type = t?.header.toLowerCase(); if (!["image", "video"].includes(type)) throw new Error("Select a media-header template first.");
      if (file.size > (type === "image" ? 5 : 16) * 1048576) throw new Error("File is too large.");
      if (type === "image" && !["image/png", "image/jpeg"].includes(file.type) || type === "video" && file.type !== "video/mp4") throw new Error("Choose matching JPEG/PNG or MP4 media.");
      let demoUrl;
      if (file.arrayBuffer && file.size <= 1048576) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); demoUrl = `data:${file.type};base64,${btoa(binary)}`; }
      const uploadId = uid(); data().senderUploads[uploadId] = { demoUrl, uploadId, type, filename: file.name, bytes: file.size, name, language }; save(); return data().senderUploads[uploadId];
    },
    senderCreate: async input => {
      const previous = data().senderJobs.find(j => j.requestId === input.requestId); if (previous) return pub(previous);
      if (!input.consentConfirmed || !input.chargesConfirmed) throw new Error("Confirm opt-in and possible charges.");
      if (data().senderJobs.some(j => ["queued", "running", "paused"].includes(j.state))) throw new Error("One active/paused job is allowed. Finish or cancel it first.");
      const t = templates.find(t => t.name === input.name && t.language === input.language); if (!t) throw new Error("Select an approved template.");
      if (t.params.some((_, i) => !input.parameters?.[i]?.trim()) || (input.parameters?.length || 0) !== t.params.length) throw new Error("Fill all template parameters.");
      const upload = input.uploadId && data().senderUploads[input.uploadId];
      if (["IMAGE", "VIDEO"].includes(t.header) && (!upload || upload.type.toUpperCase() !== t.header || upload.name !== t.name || upload.language !== t.language)) throw new Error("Upload matching template media first.");
      const p = preview(input), recipients = p.rows.filter(r => r.action === "ready").map(r => ({ _id: uid(), phone: r.phone, name: r.name, state: "pending", attempts: 0 }));
      if (!recipients.length) throw new Error("No eligible recipients.");
      const j = { _id: uid(), requestId: input.requestId, templateName: t.name, language: t.language, text: t.body.replace(/\{\{(\d+)\}\}/g, (m, k) => input.parameters[Number(k) - 1] || m), recipientCount: recipients.length, recipients, state: "queued", upload, createdAt: new Date(now()).toISOString() };
      data().senderJobs.unshift(j); save(); return pub(j);
    },
    senderJobs: async (page = 1) => { const jobs = data().senderJobs; return { jobs: jobs.slice((page - 1) * 10, page * 10).map(pub), page, hasMore: page * 10 < jobs.length }; },
    senderJob: async (id, { page = 1, state } = {}) => { const j = job(id); await advance(j); const rows = j.recipients.filter(r => !state || r.state === state); return { job: pub(j), recipients: rows.slice((page - 1) * 50, page * 50), total: rows.length, page, hasMore: page * 50 < rows.length }; },
    senderControl: async (id, action) => { const j = job(id); if (action === "cancel") { j.state = "cancelled"; j.recipients.forEach(r => { if (r.state === "pending") r.state = "cancelled"; }); } else { j.state = action === "pause" ? "paused" : "queued"; j.pauseReason = action === "pause" ? "Paused by administrator. Pending recipients are saved." : ""; } save(); return pub(j); },
    senderReview: async (id, recipient) => { const j = job(id), r = j.recipients.find(r => r._id === recipient); if (!r || r.state !== "uncertain") throw new Error("Uncertain recipient not found."); r.state = "reviewed"; save(); return { success: true }; },
    senderExport: async id => new Blob([csvText(["Name", "Phone", "State", "WhatsApp message ID", "Error"], job(id).recipients.map(r => [r.name, `+${r.phone}`, r.state, r.waMessageId, r.error]))], { type: "text/csv;charset=utf-8" }),
    senderSuppression: async (phone, blocked) => { phone = normalizeContactPhone(phone); let c = data().contacts.find(c => c.phone === phone); if (!c) { c = { _id: uid(), phone, name: "", isSaved: false, chatStarted: false }; data().contacts.push(c); } c.doNotMessage = blocked; save(); return { phone, blocked }; },
    safetyHealth: async () => { const counts = {}; data().safetyEvents.forEach(e => { counts[e.state] = (counts[e.state] || 0) + 1; }); return { version: "2.2.0", storage: { available: true, bytes: 8 * 1048576, limitBytes: 512 * 1048576, percent: 1.6, scope: "Fictional demo database measurement—not your actual Atlas usage." }, counts, lastWebhookAt: new Date(now()).toISOString(), lastIncomingAt: new Date(now() - 120000).toISOString(), senderEnabled: true, outgoingPause: data().safetyEvents.some(e => e.state === "attention" && !e.acknowledgedAt) ? "Review the captured incoming event before sending." : "" }; },
    safetyEvents: async ({ page = 1, state } = {}) => { const list = data().safetyEvents.filter(e => state === "all" || e.state !== "processed"); return { events: list.slice((page - 1) * 30, page * 30).map(({ payload, ...e }) => e), total: list.length, page, hasMore: page * 30 < list.length }; },
    safetyEvent: async id => { const e = data().safetyEvents.find(e => e._id === id); if (!e) throw new Error("Event not found."); return e; },
    safetyRetry: async id => { const e = data().safetyEvents.find(e => e._id === id); if (!e) throw new Error("Event not found."); delete e.acknowledgedAt; e.attempts++; e.reason = "BSUID_ONLY: Reprocessing simulated. Captured original is retained; phone chat/reply is not supported."; save(); return { success: true }; },
    safetyAcknowledge: async id => { const e = data().safetyEvents.find(e => e._id === id); if (!e) throw new Error("Event not found."); e.acknowledgedAt = new Date(now()).toISOString(); save(); emit("safety:update", {}); return { success: true }; }
  };
}
