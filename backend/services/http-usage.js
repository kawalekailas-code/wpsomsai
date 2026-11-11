import { performance } from "node:perf_hooks";
const thresholds = [10, 50, 100, 250, 500, 1000, 5000, 15000, 60000, Infinity];
const categories = ["api", "webhook", "auth", "health", "other"];
const blank = () => ({ requests: 0, appRequests: 0, health: 0, api: 0, webhook: 0, auth: 0, other: 0, clientErrors: 0, serverErrors: 0, aborted: 0, durationMs: 0, maxMs: 0, histogram: Array(thresholds.length).fill(0) });
function category(req) {
  const path = req.path || String(req.url || "").split("?")[0];
  if (path === "/health" || path === "/") return "health";
  if (/^\/webhook(?:\/|$)/.test(path)) return "webhook";
  if (/^\/auth(?:\/|$)/.test(path)) return "auth";
  if (/^\/api(?:\/|$)/.test(path)) return "api";
  return "other";
}
const rounded = n => Math.round(n * 10) / 10;
function summarize(rows) {
  const total = blank();
  for (const row of rows) {
    for (const key of ["requests", "appRequests", ...categories, "clientErrors", "serverErrors", "aborted", "durationMs"]) total[key] += row[key];
    total.maxMs = Math.max(total.maxMs, row.maxMs);
    row.histogram.forEach((n, i) => { total.histogram[i] += n; });
  }
  let n = 0, p95UpperBoundMs = null;
  for (let i = 0; i < thresholds.length && total.appRequests; i++) { n += total.histogram[i]; if (n >= Math.ceil(total.appRequests * .95)) { p95UpperBoundMs = Number.isFinite(thresholds[i]) ? thresholds[i] : null; break; } }
  const { histogram, durationMs, ...result } = total;
  return { ...result, averageMs: total.appRequests ? rounded(durationMs / total.appRequests) : null, maxMs: total.appRequests ? rounded(total.maxMs) : null, p95UpperBoundMs };
}
export function createHttpUsage({ now = Date.now, durationNow = () => performance.now() } = {}) {
  const seconds = new Map(), minutes = new Map(), startedAt = new Date(now()).toISOString();
  let active = 0, completedSinceStart = 0;
  function prune(map, minimum) { for (const key of map.keys()) if (key < minimum) map.delete(key); }
  function add(map, key, type, status, ms, aborted) {
    const row = map.get(key) || blank(); map.set(key, row);
    row.requests++; row[type]++;
    if (type !== "health") {
      row.appRequests++; row.durationMs += ms; row.maxMs = Math.max(row.maxMs, ms);
      row.histogram[thresholds.findIndex(value => ms <= value)]++;
      if (status >= 400 && status < 500) row.clientErrors++;
      if (status >= 500) row.serverErrors++;
      if (aborted) row.aborted++;
    }
  }
  return {
    middleware(req, res, next) {
      const start = durationNow(), type = category(req); let done = false; active++;
      function finish(aborted = false) {
        if (done) return; done = true; active = Math.max(0, active - 1); completedSinceStart++;
        const at = now(), second = Math.floor(at / 1000), minute = Math.floor(at / 60000), ms = Math.max(0, durationNow() - start);
        prune(seconds, second - 59); prune(minutes, minute - 59);
        add(seconds, second, type, res.statusCode, ms, aborted); add(minutes, minute, type, res.statusCode, ms, aborted);
      }
      res.once("finish", () => finish(false)); res.once("close", () => finish(!res.writableFinished)); next();
    },
    snapshot() {
      const at = now(), second = Math.floor(at / 1000), minute = Math.floor(at / 60000);
      prune(seconds, second - 59); prune(minutes, minute - 59);
      return {
        startedAt, observedAt: new Date(at).toISOString(), activeRequests: active, completedSinceStart,
        lastMinute: { ...summarize([...seconds.values()]), from: new Date((second - 59) * 1000).toISOString() },
        lastHour: { ...summarize([...minutes.values()]), from: new Date((minute - 59) * 60000).toISOString() },
        minutes: Array.from({ length: 60 }, (_, i) => { const key = minute - 59 + i, row = minutes.get(key) || blank(); return { at: new Date(key * 60000).toISOString(), requests: row.appRequests, webhooks: row.webhook, serverErrors: row.serverErrors }; }),
        scope: "In-memory counters for this backend instance only, reset on restart. Last minute uses 60 second-buckets; hour uses 60 minute-buckets. Dashboard polls are included; health checks are separate. Socket.IO transport, frontend static traffic, outgoing Graph API calls and provider bandwidth/billing are not measured. Latency is server response time; p95 is a histogram upper bound, not browser round-trip latency. Active requests can include this poll."
      };
    }
  };
}
