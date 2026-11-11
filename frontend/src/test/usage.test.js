import { describe, it, expect } from "vitest";
import { bytes, number, percent, uptime, statesTotal, cpuDisplay } from "../lib/usage.js";
import { makeDemoService } from "../lib/demo.js";
const memory = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; };
describe("truthful system usage presentation", () => {
  it("distinguishes a measured zero from an unavailable byte count", () => {
    expect(bytes(0)).toBe("0 B"); expect(bytes(512 * 1048576)).toBe("512 MB"); expect(bytes(1073741824)).toBe("1.0 GB");
    for (const n of [null, undefined, NaN, Infinity, -1, "512"]) expect(bytes(n)).toBe("Unavailable");
  });
  it("does not silently convert missing percentages or counts to zero", () => {
    expect(percent(0)).toBe("0.0%"); expect(percent(12.56)).toBe("12.6%"); expect(number(0)).toBe("0"); expect(number(null)).toBe("Unavailable"); expect(percent(null)).toBe("Unavailable"); expect(percent(Infinity)).toBe("Unavailable");
  });
  it("labels backend uptime without implying provider uptime or monthly hours", () => {
    expect(uptime(0)).toBe("0m 0s"); expect(uptime(4923)).toBe("1h 22m"); expect(uptime(90061)).toBe("1d 1h 1m"); expect(uptime(undefined)).toBe("Unavailable");
  });
  it("prefers interval limited-cgroup CPU only when it was actually observed", () => {
    const runtime = { cpu: { cgroupQuotaPercent: 12, nodeQuotaPercent: 10, nodeOneCorePercent: 1, quotaCores: .1 } };
    expect(cpuDisplay(runtime)).toEqual({ value: 12, scope: "Limited cgroup", basis: "0.1 core quota" }); delete runtime.cpu.cgroupQuotaPercent;
    expect(cpuDisplay(runtime).scope).toBe("Node process"); expect(cpuDisplay(runtime).value).toBe(10); delete runtime.cpu.nodeQuotaPercent;
    expect(cpuDisplay(runtime).basis).toBe("one core; quota unavailable"); expect(cpuDisplay({}).value).toBe(null);
  });
  it("keeps unavailable queue summaries separate from a measured empty queue", () => {
    expect(statesTotal(null, ["pending"])).toBe(null); expect(statesTotal({}, ["pending"])).toBe(0); expect(statesTotal({ pending: 2, leased: 1, sending: 1, uncertain: 4 }, ["pending", "leased", "sending"])).toBe(4);
  });
});
describe("explicitly fictional usage demo", () => {
  it("provides locally generated, labeled metrics with no message text, phones or live API", async () => {
    const api = makeDemoService({ storage: memory(), delay: 0 }); const r = await api.systemUsage();
    expect(r.version).toBe("2.3.0"); expect(r.runtime.scope).toContain("Fictional"); expect(r.note).toContain("fictional"); expect(r.http.minutes).toHaveLength(60); expect(r.database.storage.limitBytes).toBe(512 * 1048576); expect(r.database.retainedMessageEstimate).toBe(16);
    expect(JSON.stringify(r)).not.toMatch(/919000000001|How's your day|Neha Patil|wamid\./);
  });
  it("reading usage never advances a demo sending job or creates an outgoing message", async () => {
    const api = makeDemoService({ storage: memory(), delay: 0 }); const before = await api.systemUsage();
    const job = await api.senderCreate({ requestId: crypto.randomUUID(), source: "rows", recipients: [{ phone: "919000000001" }, { phone: "919000000002" }], name: "demo_greeting", language: "en", parameters: ["Friend"], consentConfirmed: true, chargesConfirmed: true });
    const one = await api.systemUsage(), two = await api.systemUsage();
    expect(one.database.retainedMessageEstimate).toBe(before.database.retainedMessageEstimate); expect(two.database.retainedMessageEstimate).toBe(before.database.retainedMessageEstimate); expect(two.database.queue.recipientStates.pending).toBe(2); expect((await api.senderJobs()).jobs[0]._id).toBe(job._id);
  });
});
