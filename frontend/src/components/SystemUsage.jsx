import React, { useCallback, useEffect, useRef, useState } from "react";
import { Gauge, Cpu, MemoryStick, Database, Activity, RefreshCw, Download, Clock3, ShieldCheck, Send, AlertTriangle, Check, Server } from "lucide-react";
import { Modal, Spinner } from "./ui.jsx";
import { downloadBlob } from "../lib/chat.js";
import { bytes, number, percent, uptime, cpuDisplay, statesTotal } from "../lib/usage.js";
const date = value => value ? new Date(value).toLocaleString() : "Not measured";
const time = value => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
const ms = value => typeof value === "number" ? `${value.toFixed(1)} ms` : "Unavailable";
function Meter({ value, label }) { return value == null ? null : <progress aria-label={`${label} measured percentage`} aria-valuetext={percent(value)} className={value >= 90 ? "critical" : value >= 75 ? "warning" : ""} max="100" value={Math.min(100, Math.max(0, value))} />; }
function Metric({ icon: Icon, label, value, detail, load }) { return <div className="usage-metric"><div><Icon size={19} /><small>{label}</small></div><strong>{value}</strong><Meter value={load} label={label} /><span>{detail}</span></div>; }
function Row({ label, value }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function RequestChart({ points = [] }) {
  const max = Math.max(1, ...points.map(p => p.requests));
  return <><svg className="usage-chart" viewBox="0 0 720 128" role="img" aria-label="App HTTP requests per minute over sixty minute-buckets; health checks excluded">
    {[22, 61, 100].map(y => <path key={y} d={`M20 ${y}H700`} className="usage-chart-grid" />)}
    {points.map((p, i) => { const h = p.requests / max * 78; return <rect key={p.at} x={26 + i * 11} y={100 - h} width="7" height={h} rx="2" className={p.serverErrors ? "with-errors" : ""}><title>{time(p.at)} · {p.requests} app requests · {p.serverErrors} server errors</title></rect>; })}
    <text x="20" y="122">{time(points[0]?.at)}</text><text x="350" y="122" textAnchor="middle">{time(points[30]?.at)}</text><text x="698" y="122" textAnchor="end">{time(points.at(-1)?.at)}</text>
  </svg><p className="usage-chart-caption">{points.some(p => p.requests) ? "Completed app requests, not WhatsApp messages. Current minute is partial; health checks excluded." : "No completed app requests in this window yet."}</p></>;
}
export default function SystemUsage({ api, onClose, onOpenSafety, onOpenSender }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [auto, setAuto] = useState(true);
  const alive = useRef(true), epoch = useRef(0), inFlight = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; inFlight.current = null; }; }, []);
  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const request = ++epoch.current; setBusy(true);
    // React StrictMode can clean up and remount effects before this microtask.
    // Invalidate that obsolete request before it performs any network read.
    const work = Promise.resolve().then(() => alive.current && request === epoch.current ? api.systemUsage() : null).then(result => {
      if (result && alive.current && request === epoch.current) { setData(result); setError(""); }
    }).catch(err => {
      if (alive.current && request === epoch.current) setError(err.message === "Endpoint not found." ? "System Usage needs backend v2.3. Update frontend and backend together; this screen cannot infer metrics from the old backend." : err.message);
    }).finally(() => {
      if (inFlight.current === work) inFlight.current = null;
      if (alive.current && request === epoch.current) setBusy(false);
    });
    inFlight.current = work; return work;
  }, [api]);
  useEffect(() => { if (!document.hidden) load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    let mounted = true, timer;
    const tick = async () => { if (!mounted) return; if (!document.hidden) await load(); if (mounted) timer = setTimeout(tick, 15000); };
    const foreground = () => { if (!document.hidden) load(); };
    timer = setTimeout(tick, 15000); document.addEventListener("visibilitychange", foreground);
    return () => { mounted = false; clearTimeout(timer); document.removeEventListener("visibilitychange", foreground); };
  }, [auto, load]);
  const runtime = data?.runtime || {}, database = data?.database || {}, mem = runtime.memory || {}, cpu = cpuDisplay(runtime), storage = database.storage || {}, traffic = data?.http || {}, minute = traffic.lastMinute || {}, hour = traffic.lastHour || {}, activity = database.activity;
  const containerMemory = mem.cgroupUsedBytes != null && mem.cgroupLimitBytes > 0;
  const queue = database.queue?.recipientStates, jobs = database.queue?.jobStates, inbox = database.inbox;
  const backlog = statesTotal(inbox?.states, ["pending", "processing", "failed"]), queuePending = statesTotal(queue, ["pending", "leased", "sending"]);
  return <Modal title="System Usage" wide className="sender-dialog usage-dialog" onClose={onClose}>
    <div className="sender-hero"><span className="sender-hero-icon"><Gauge size={28} /></span><div><span className="eyebrow">A CLEARER VIEW OF YOUR WORKSPACE</span><h3>Your system, in numbers.</h3><p>CPU & memory · Database budget · Activity & recovery</p></div><span className="sender-admin">Admin only</span></div>
    {api.demo && <p className="sender-note"><ShieldCheck size={18} />Fictional demo metrics. These are not your actual server, MongoDB or WhatsApp account usage.</p>}
    <div className="usage-toolbar"><label className="sender-consent"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /><span>Auto-refresh while visible · 15 seconds</span></label><div><button className="button secondary small" disabled={busy} onClick={load}><RefreshCw size={14} />{busy ? "Measuring…" : "Refresh usage"}</button><button className="button secondary small" disabled={!data} onClick={() => downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "omsai-system-usage.json")}><Download size={14} />Export snapshot</button></div></div>
    {error && <div className="inline-error" role="alert">{error}{data && " Showing the last successful snapshot; it may be stale."}</div>}
    {!data ? !error && <div className="loading-line"><Spinner /><span>Reading lightweight usage counters…</span></div> : <>
      <div className="usage-observed"><span><Server size={13} />Backend measured {date(runtime.observedAt)}</span><span><Clock3 size={13} />DB snapshot {date(database.observedAt)}</span><span>v{data.version}</span></div>
      {(database.stale || !database.connected || database.partial) && <p className="sender-warning"><AlertTriangle size={16} />{database.warning || `Some database metrics are unavailable: ${(database.unavailableMetrics || []).join(", ")}. Missing values are not zero usage.`}</p>}
      <div className="usage-metrics">
        <Metric icon={Cpu} label="CPU load" value={percent(cpu.value)} load={cpu.value} detail={`${cpu.scope} / ${cpu.basis} · ${runtime.cpu?.windowSeconds ?? "?"}s average`} />
        <Metric icon={MemoryStick} label={containerMemory ? "Service RAM · cgroup" : "Node RAM · RSS"} value={bytes(containerMemory ? mem.cgroupUsedBytes : mem.nodeRssBytes)} load={containerMemory ? mem.cgroupPercent : mem.nodeRssPercentOfLimit} detail={mem.cgroupLimitBytes ? `${percent(containerMemory ? mem.cgroupPercent : mem.nodeRssPercentOfLimit)} of ${bytes(mem.cgroupLimitBytes)} detected cgroup limit` : "Cgroup memory limit not exposed; no host-wide total guessed"} />
        <Metric icon={Database} label="MongoDB budget" value={storage.available ? bytes(storage.bytes) : "Unavailable"} load={storage.available ? storage.percent : null} detail={storage.available ? `${percent(storage.percent)} of ${bytes(storage.limitBytes)} configured budget · data + indexes` : "Check database connection and statistics permissions"} />
        <Metric icon={Activity} label="App requests · last minute" value={number(minute.appRequests)} detail={`${number(minute.health)} health checks counted separately; dashboard polls included`} />
      </div>
      {storage.available && storage.percent >= 75 && <p className="sender-warning">Storage warning: Atlas is authoritative. At 90% the outgoing queue holds; a full database can still reject incoming writes. No automatic destructive cleanup is performed.</p>}
      <div className="usage-columns">
        <section className="usage-panel"><div className="usage-section-head"><h4><Activity size={18} />HTTP activity</h4><span>Current backend instance · last hour</span></div><RequestChart points={traffic.minutes} /><div className="usage-small-stats"><div><strong>{number(hour.appRequests)}</strong><small>app requests</small></div><div><strong>{number(hour.webhook)}</strong><small>webhook HTTP requests</small></div><div><strong className={hour.serverErrors ? "danger" : ""}>{number(hour.serverErrors)}</strong><small>HTTP 5xx responses</small></div></div><dl className="usage-rows"><Row label="Active HTTP requests" value={number(traffic.activeRequests)} /><Row label="Average server response · last minute" value={ms(minute.averageMs)} /><Row label="p95 latency upper bucket · last minute" value={ms(minute.p95UpperBoundMs)} /><Row label="HTTP 4xx / aborted · last minute" value={`${number(minute.clientErrors)} / ${number(minute.aborted)}`} /><Row label="Connected Socket.IO clients" value={number(data.connectedSockets)} /></dl><p className="usage-footnote">Counters reset on restart; no HTTP history is stored in MongoDB. An active request may be this poll. A webhook request can contain multiple events; it is not a unique-message count.</p></section>
        <section className="usage-panel"><div className="usage-section-head"><h4><MemoryStick size={18} />Backend resources</h4><span>Not the frontend static site</span></div><dl className="usage-rows"><Row label="Backend uptime · since restart" value={uptime(runtime.uptimeSeconds)} /><Row label="Node process RAM · RSS" value={bytes(mem.nodeRssBytes)} /><Row label="Node heap · used / allocated" value={`${bytes(mem.heapUsedBytes)} / ${bytes(mem.heapTotalBytes)}`} /><Row label="Node external / array buffers" value={`${bytes(mem.externalBytes)} / ${bytes(mem.arrayBuffersBytes)}`} /><Row label="Limited cgroup RAM · used / quota" value={`${bytes(mem.cgroupUsedBytes)} / ${bytes(mem.cgroupLimitBytes)}`} /><Row label="CPU sampling window" value={runtime.cpu?.window || "Unavailable"} /><Row label="CPU quota source" value={runtime.cpu?.quotaSource || "Not exposed by host"} /><Row label="Node CPU · percent of one core" value={percent(runtime.cpu?.nodeOneCorePercent)} /><Row label="Event loop busy time" value={percent(runtime.eventLoopBusyPercent)} /></dl><p className="usage-footnote">{runtime.scope} Heap/external/buffer figures overlap; do not add them to RSS. CPU is averaged over the labeled sample window, not an instantaneous capacity guarantee. Event-loop busy time is not CPU usage.</p></section>
      </div>
      <div className="usage-columns">
        <section className="usage-panel"><div className="usage-section-head"><h4><Database size={18} />Database & stored activity</h4><span>Cached up to 60 seconds</span></div><div className="usage-small-stats"><div><strong>{number(activity?.incoming)}</strong><small>incoming rows · 24h</small></div><div><strong>{number(activity?.outgoing)}</strong><small>outgoing rows · 24h</small></div><div><strong>{number(activity?.templateOutgoing)}</strong><small>template rows · 24h</small></div></div><dl className="usage-rows"><Row label="Logical data / indexes" value={`${bytes(storage.dataBytes)} / ${bytes(storage.indexBytes)}`} /><Row label="Allocated data · not budget numerator" value={bytes(storage.allocatedDataBytes)} /><Row label="Saved contacts / estimated number records" value={`${number(database.savedContacts)} / ${number(database.contactRecordsEstimate)}`} /><Row label="Retained message records · estimate" value={number(database.retainedMessageEstimate)} /><Row label="Outgoing delivered/read/played · current states, 24h rows" value={number(statesTotal(activity?.outgoingStates, ["delivered", "seen", "played"]))} /><Row label="Outgoing failed / pending · current states, 24h rows" value={`${number(statesTotal(activity?.outgoingStates, ["failed"]))} / ${number(statesTotal(activity?.outgoingStates, ["pending"]))}`} /></dl><p className="usage-footnote">{database.scope} Storage is for this database only; Atlas cluster usage is authoritative. Retention remains 30 days for chats, including stars. A message count is not a bill.</p></section>
        <section className="usage-panel"><div className="usage-section-head"><h4><ShieldCheck size={18} />Queue & incoming recovery</h4><span className={`usage-status ${data.senderEnabled ? "enabled" : ""}`}>{data.senderEnabled ? "Sender enabled" : "Sender disabled"}</span></div><dl className="usage-rows"><Row label="Incoming pending / processing / failed" value={number(backlog)} /><Row label="Unreviewed captured attention events" value={number(inbox?.unreviewed)} /><Row label="Queued / leased / in-flight recipients" value={number(queuePending)} /><Row label="Uncertain sends · never auto-resent" value={number(statesTotal(queue, ["uncertain"]))} /><Row label="Active / paused jobs" value={`${number(statesTotal(jobs, ["preparing", "queued", "running"]))} / ${number(statesTotal(jobs, ["paused"]))}`} /><Row label="Stats connection" value={database.connected ? "Database driver connected" : "Disconnected / unknown"} /></dl><div className="usage-links"><button className="button secondary small" onClick={onOpenSafety}><ShieldCheck size={14} />Open Incoming Safety</button><button className="button secondary small" onClick={onOpenSender}><Send size={14} />Open Template Sender</button></div><p className="usage-footnote">One queue send at a time; normal incoming traffic remains independent. Counts are retained app records, not proof that no upstream message was missed. A disabled sender does not disable incoming recovery.</p></section>
      </div>
      <div className="usage-unavailable"><Gauge size={23} /><div><h4>What this app cannot measure</h4><p>{(data.unavailableProviderMetrics || []).join(" · ")}. Use your provider consoles for those values; this screen does not fabricate a remaining quota or monthly bill.</p></div></div>
      <p className="sender-note"><Check size={16} />Read-only diagnostics · No new paid service or monitoring collection · No keepalive · No test messages</p><p className="usage-footnote">{data.note}</p>
    </>}
  </Modal>;
}
