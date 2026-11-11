import { describe, it, expect } from "vitest";
import { senderTotals, mergeCatchUp } from "../lib/sender.js";
import { parseContactCsv } from "../lib/contact-files.js";
import { makeDemoService } from "../lib/demo.js";
const memory = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; };
const demo = storage => makeDemoService({ storage: storage || memory(), delay: 0 });
const create = (api, more = {}) => api.senderCreate({ requestId: crypto.randomUUID(), source: "rows", recipients: [{ phone: "919000000001", name: "Fictional" }, { phone: "919000000002" }], name: "demo_greeting", language: "en", parameters: ["Friend"], consentConfirmed: true, chargesConfirmed: true, ...more });
describe("incoming-first sender utilities", () => {
  it("counts accepted separately from delivery and keeps uncertain work explicit", () => {
    expect(senderTotals({ pending: 2, leased: 1, sending: 1, accepted: 3, delivered: 2, seen: 1, failed: 1, uncertain: 1 })).toEqual({ pending: 4, accepted: 6, delivered: 3, failed: 1, uncertain: 1, cancelled: 0 });
  });
  it("supports 1000+ sender CSV rows without changing the 500-contact import limit", () => {
    const text = "Phone\n" + Array.from({ length: 1200 }, (_, i) => `91900000${String(i).padStart(4, "0")}`).join("\n");
    expect(() => parseContactCsv(text)).toThrow("500"); expect(parseContactCsv(text, { maxRows: 5000 })).toHaveLength(1200);
  });
  it("merges missed updates idempotently, removes tombstones and retains delayed post-clear incoming", () => {
    const previous = [{ _id: "a", message: "Old", createdAt: "2026-11-01" }, { _id: "b", createdAt: "2026-11-03" }];
    const update = { removed: ["b"], clearedAt: "2026-11-02", messages: [{ _id: "c", createdAt: "2026-11-01", receivedAt: "2026-11-04", message: "Delayed incoming" }] };
    const merged = mergeCatchUp(previous, update); expect(merged.map(m => m._id)).toEqual(["c"]); expect(mergeCatchUp(merged, update)).toEqual(merged);
  });
  it("does not inject new messages into an around-search window", () => {
    const previous = [{ _id: "a", createdAt: "2026-11-01", status: "sent" }];
    const update = { messages: [{ _id: "a", createdAt: "2026-11-01", status: "seen" }, { _id: "b", createdAt: "2026-11-03" }] };
    expect(mergeCatchUp(previous, update, { around: true })).toEqual([{ _id: "a", createdAt: "2026-11-01", status: "seen" }]);
  });
});
describe("explicitly fictional template sender", () => {
  it("previews exclusions without creating a job and honors do-not-send", async () => {
    const api = demo(); await api.senderSuppression("919000000001", true);
    const p = await api.senderPreview({ recipients: [{ phone: "919000000001" }, { phone: "919000000001" }, { phone: "bad" }, { phone: "919000000002" }] });
    expect(p.summary).toEqual({ total: 4, ready: 1, invalid: 1, duplicate: 1, blocked: 1 }); expect((await api.senderJobs()).jobs).toHaveLength(0);
  });
  it("requires confirmation and persists one idempotent job across demo reloads", async () => {
    const storage = memory(), api = demo(storage); await expect(create(api, { consentConfirmed: false })).rejects.toThrow("opt-in");
    const id = crypto.randomUUID(), j = await create(api, { requestId: id }); const same = await create(api, { requestId: id }); expect(same._id).toBe(j._id);
    const reloaded = demo(storage); expect((await reloaded.senderJobs()).jobs[0]._id).toBe(j._id); expect((await reloaded.senderJob(j._id)).job.counts.delivered).toBe(1);
  });
  it("pauses/cancels only pending demo rows and exports a formula-safe report", async () => {
    const api = demo(), j = await create(api, { recipients: [{ name: "=formula", phone: "919000000001" }, { phone: "919000000002" }] });
    await api.senderControl(j._id, "pause"); expect((await api.senderJob(j._id)).job.counts.pending).toBe(2);
    await api.senderControl(j._id, "resume"); expect((await api.senderJob(j._id)).job.counts.delivered).toBe(1);
    await api.senderControl(j._id, "cancel"); const d = await api.senderJob(j._id); expect(d.job.counts.cancelled).toBe(1); expect(d.job.counts.delivered).toBe(1);
    const text = await (await api.senderExport(j._id)).text(); expect(text).toContain("'=formula"); expect(text).toContain("'+919000000001");
  });
  it("preserves a BSUID-only captured event through retry and acknowledgement", async () => {
    const api = demo(); const e = (await api.safetyEvents({})).events[0]; expect(e.payload).toBeUndefined(); const original = (await api.safetyEvent(e._id)).payload;
    await api.safetyRetry(e._id); expect((await api.safetyHealth()).outgoingPause).toContain("Review");
    await api.safetyAcknowledge(e._id); expect((await api.safetyEvent(e._id)).payload).toEqual(original); expect((await api.safetyHealth()).outgoingPause).toBe("");
  });
});
