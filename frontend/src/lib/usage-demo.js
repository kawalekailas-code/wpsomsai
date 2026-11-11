export function demoUsage(data, now = Date.now()) {
  const at = new Date(now).toISOString(), from = new Date(now - 86400000).toISOString(), mb = 1048576;
  const activity = { from, through: at, incoming: 0, outgoing: 0, templateOutgoing: 0, outgoingStates: {} };
  for (const m of data.messages) {
    if (new Date(m.receivedAt || m.createdAt).getTime() < now - 86400000) continue;
    activity[m.direction]++;
    if (m.direction === "outgoing") { activity.outgoingStates[m.status] = (activity.outgoingStates[m.status] || 0) + 1; if (m.type === "template") activity.templateOutgoing++; }
  }
  const inbox = { states: {}, unreviewed: 0 }, recipientStates = {}, jobStates = {};
  for (const e of data.safetyEvents || []) { inbox.states[e.state] = (inbox.states[e.state] || 0) + 1; if (e.state === "attention" && !e.acknowledgedAt) inbox.unreviewed++; }
  for (const job of data.senderJobs || []) { jobStates[job.state] = (jobStates[job.state] || 0) + 1; for (const r of job.recipients) if (["pending", "leased", "sending", "uncertain"].includes(r.state)) recipientStates[r.state] = (recipientStates[r.state] || 0) + 1; }
  return {
    version: "2.3.0", generatedAt: at, senderEnabled: true, connectedSockets: 1,
    runtime: {
      observedAt: at, uptimeSeconds: 4923, startedAt: new Date(now - 4923000).toISOString(), eventLoopBusyPercent: 2.4,
      cpu: { nodeOneCorePercent: 1.1, nodeQuotaPercent: 11, cgroupOneCorePercent: 1.2, cgroupQuotaPercent: 12, quotaCores: .1, windowSeconds: 15, window: "since previous sample", quotaSource: "fictional cgroup" },
      memory: { nodeRssBytes: 112 * mb, heapUsedBytes: 31 * mb, heapTotalBytes: 54 * mb, externalBytes: 5 * mb, arrayBuffersBytes: 3 * mb, cgroupUsedBytes: 136 * mb, cgroupLimitBytes: 512 * mb, cgroupPercent: 26.6, nodeRssPercentOfLimit: 21.9, limitSource: "fictional cgroup" },
      scope: "Fictional demonstration counters, not your actual server or hosting bill."
    },
    http: {
      startedAt: new Date(now - 4923000).toISOString(), observedAt: at, activeRequests: 1, completedSinceStart: 483,
      lastMinute: { appRequests: 8, requests: 11, health: 3, api: 6, webhook: 2, auth: 0, clientErrors: 0, serverErrors: 0, aborted: 0, averageMs: 18.6, maxMs: 74, p95UpperBoundMs: 100 },
      lastHour: { appRequests: 420, requests: 483, health: 63, webhook: 35, clientErrors: 2, serverErrors: 0, averageMs: 21.2, maxMs: 810, p95UpperBoundMs: 100 },
      minutes: Array.from({ length: 60 }, (_, i) => ({ at: new Date((Math.floor(now / 60000) - 59 + i) * 60000).toISOString(), requests: 2 + i % 4 + Math.round(Math.sin(i / 5) * 2 + 2), webhooks: i % 5 === 0 ? 2 : 0, serverErrors: 0 })),
      scope: "Fictional sample chart. Real HTTP counters are bounded, in-memory, per backend instance and reset on restart. Health checks are separate; dashboard polls are included."
    },
    database: {
      available: true, connected: true, stale: false, observedAt: at, cacheSeconds: 60, partial: false, unavailableMetrics: [], diagnosticReadMs: 18,
      storage: { available: true, bytes: 8 * mb, dataBytes: 6 * mb, indexBytes: 2 * mb, allocatedDataBytes: 7 * mb, indexCount: 28, limitBytes: 512 * mb, percent: 1.6, measuredAt: at, scope: "Fictional database measurement; Atlas usage is authoritative in real mode." },
      retainedMessageEstimate: data.messages.length, contactRecordsEstimate: data.contacts.length, savedContacts: data.contacts.filter(c => c.isSaved !== false).length,
      activity, inbox, queue: { recipientStates, jobStates }, scope: "Browser-local demo records. These numbers do not inspect your real WhatsApp account, MongoDB or server."
    },
    unavailableProviderMetrics: ["Monthly hosting hours/bandwidth/billing", "Atlas cluster-wide quota/billing and other databases", "Meta account-wide messaging limits/charges and external-tool history"],
    note: "This is an explicitly fictional preview. Real metrics appear only after deploying the new backend and signing in as an administrator."
  };
}
