import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { cgroupDirectories, readCgroup, createRuntimeSampler } from "../services/system-runtime.js";
import { createHttpUsage } from "../services/http-usage.js";
const mount = (type, root = "/", at = "/sys/fs/cgroup", options = "rw") => `28 23 0:24 ${root} ${at} rw - ${type} cgroup ${options}`;
const readFiles = files => async file => files[file] ?? null;

test("cgroup v2 resolves this process, not the host's root counters", async () => {
  assert.deepEqual(cgroupDirectories("0::/service/task", mount("cgroup2", "/service")), { unified: "/sys/fs/cgroup/task" });
  const files = { "/proc/self/cgroup": "0::/service/task", "/proc/self/mountinfo": mount("cgroup2"), "/sys/fs/cgroup/service/task/memory.max": "536870912\n", "/sys/fs/cgroup/service/task/memory.current": "104857600", "/sys/fs/cgroup/service/task/cpu.max": "10000 100000", "/sys/fs/cgroup/service/task/cpu.stat": "usage_usec 12000000\nuser_usec 9000000" };
  assert.deepEqual(await readCgroup(readFiles(files)), { source: "cgroup-v2", memoryLimitBytes: 536870912, memoryUsedBytes: 104857600, cpuQuotaCores: .1, cpuUsageUs: 12000000 });
});
test("unlimited/missing cgroup limits stay unknown, not host capacity or zero", async () => {
  const base = { "/proc/self/cgroup": "0::/", "/proc/self/mountinfo": mount("cgroup2"), "/sys/fs/cgroup/memory.max": "max", "/sys/fs/cgroup/memory.current": "8000000", "/sys/fs/cgroup/cpu.max": "max 100000", "/sys/fs/cgroup/cpu.stat": "usage_usec 1000000" };
  const result = await readCgroup(readFiles(base)); assert.equal(result.memoryUsedBytes, null); assert.equal(result.memoryLimitBytes, null); assert.equal(result.cpuQuotaCores, null); assert.equal(result.cpuUsageUs, null);
  const rootOnly = { ...base, "/proc/self/cgroup": "0::/unmounted-child", "/sys/fs/cgroup/memory.max": "536870912", "/sys/fs/cgroup/cpu.max": "10000 100000" };
  const child = await readCgroup(readFiles(rootOnly)); assert.equal(child.memoryLimitBytes, null); assert.equal(child.cpuQuotaCores, null);
  assert.equal((await readCgroup(readFiles({}))).source, null);
});
test("cgroup v1 handles separate/combined controller mounts and rejects unlimited sentinels", async () => {
  const files = { "/proc/self/cgroup": "2:memory:/app\n3:cpu,cpuacct:/app", "/proc/self/mountinfo": `${mount("cgroup", "/", "/sys/fs/cgroup/memory", "rw,memory")}\n${mount("cgroup", "/", "/sys/fs/cgroup/cpu,cpuacct", "rw,cpu,cpuacct")}`, "/sys/fs/cgroup/memory/app/memory.limit_in_bytes": "536870912", "/sys/fs/cgroup/memory/app/memory.usage_in_bytes": "100000000", "/sys/fs/cgroup/cpu,cpuacct/app/cpu.cfs_quota_us": "50000", "/sys/fs/cgroup/cpu,cpuacct/app/cpu.cfs_period_us": "100000", "/sys/fs/cgroup/cpu,cpuacct/app/cpuacct.usage": "42000000000" };
  assert.deepEqual(await readCgroup(readFiles(files)), { source: "cgroup-v1", memoryLimitBytes: 536870912, memoryUsedBytes: 100000000, cpuQuotaCores: .5, cpuUsageUs: 42000000 });
  files["/sys/fs/cgroup/memory/app/memory.limit_in_bytes"] = "9223372036854771712"; files["/sys/fs/cgroup/cpu,cpuacct/app/cpu.cfs_quota_us"] = "-1";
  const unknown = await readCgroup(readFiles(files)); assert.equal(unknown.memoryLimitBytes, null); assert.equal(unknown.cpuQuotaCores, null);
});
test("unresolvable/traversing cgroup membership is not replaced with global OS totals", () => {
  assert.deepEqual(cgroupDirectories("0::/../outside", mount("cgroup2")), {});
  assert.deepEqual(cgroupDirectories("0::/other", mount("cgroup2", "/private")), {});
  assert.deepEqual(cgroupDirectories("invalid", mount("cgroup2")), {});
});
test("runtime distinguishes lifetime Node CPU, interval CPU, cgroup quota and overlapping RAM", async () => {
  let at = 100000, up = 100, cpu = { user: 1000000, system: 0 }, cg = { source: "cgroup-v2", cpuQuotaCores: .1, cpuUsageUs: 50000000, memoryLimitBytes: 512, memoryUsedBytes: 128 }, loop = { active: 100, idle: 900 };
  const sample = createRuntimeSampler({ now: () => at, uptime: () => up, cpuUsage: () => ({ ...cpu }), memoryUsage: () => ({ rss: 64, heapUsed: 20, heapTotal: 40, external: 9, arrayBuffers: 4 }), eventLoop: () => ({ ...loop }), cgroup: async () => ({ ...cg }) });
  const first = await sample(); assert.equal(first.cpu.nodeOneCorePercent, 1); assert.equal(first.cpu.nodeQuotaPercent, 10); assert.equal(first.cpu.cgroupQuotaPercent, null); assert.equal(first.cpu.window, "since Node process start"); assert.equal(first.eventLoopBusyPercent, 10); assert.equal(first.memory.cgroupPercent, 25); assert.equal(first.memory.nodeRssPercentOfLimit, 12.5);
  at += 15000; up += 15; cpu.user += 300000; cg.cpuUsageUs += 450000; loop = { active: 400, idle: 15600 };
  const next = await sample(); assert.equal(next.cpu.windowSeconds, 15); assert.equal(next.cpu.nodeOneCorePercent, 2); assert.equal(next.cpu.nodeQuotaPercent, 20); assert.equal(next.cpu.cgroupOneCorePercent, 3); assert.equal(next.cpu.cgroupQuotaPercent, 30); assert.equal(next.eventLoopBusyPercent, 2);
});
test("runtime coalesces concurrent reads, caches for five seconds and handles inaccessible cgroups", async () => {
  let at = 10000, reads = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const sample = createRuntimeSampler({ now: () => at, uptime: () => 10, cpuUsage: () => ({ user: 100, system: 0 }), memoryUsage: () => ({ rss: 123 }), eventLoop: () => ({ active: 0, idle: 0 }), cgroup: async () => { reads++; await pending; throw new Error("not exposed"); } });
  const a = sample(), b = sample(); release(); const [one, two] = await Promise.all([a, b]); assert.deepEqual(one, two); assert.equal(reads, 1); assert.equal(one.memory.cgroupLimitBytes, null); assert.equal(one.cpu.quotaSource, null); assert.equal(one.memory.heapUsedBytes, null); assert.equal(one.eventLoopBusyPercent, null);
  await sample(); assert.equal(reads, 1); at += 5001; await sample(); assert.equal(reads, 2);
});
test("negative/reset CPU deltas never masquerade as a healthy zero load", async () => {
  let at = 10000, up = 10, cpu = 100000;
  const sample = createRuntimeSampler({ now: () => at, uptime: () => up, cpuUsage: () => ({ user: cpu, system: 0 }), memoryUsage: () => ({ rss: 123 }), eventLoop: () => ({ active: 1, idle: 9 }), cgroup: async () => ({}) });
  await sample(); at += 6000; up += 6; cpu = 1; const result = await sample(); assert.equal(result.cpu.nodeOneCorePercent, null); assert.equal(result.memory.cgroupPercent, null);
});

test("HTTP counters classify without retaining tokens, URLs, message bodies or contact identifiers", () => {
  let at = 100000, duration = 0; const usage = createHttpUsage({ now: () => at, durationNow: () => duration });
  function request(path, status = 200, ms = 20, close = false) { const res = new EventEmitter(); res.statusCode = status; res.writableFinished = !close; usage.middleware({ path, headers: { authorization: "TOP-SECRET-TOKEN" }, body: { phone: "919999999999", text: "PRIVATE CONTENT" } }, res, () => {}); duration += ms; res.emit(close ? "close" : "finish"); res.emit("close"); }
  request("/health", 200, 500); request("/api/messages/919999999999", 403, 40); request("/webhook", 500, 80); request("/auth/login", 401, 10); request("/api/system/usage", 200, 20); request("/not-found", 404, 5, true);
  const result = usage.snapshot(), minute = result.lastMinute;
  assert.equal(result.activeRequests, 0); assert.equal(result.completedSinceStart, 6); assert.equal(minute.requests, 6); assert.equal(minute.appRequests, 5); assert.equal(minute.health, 1); assert.equal(minute.api, 2); assert.equal(minute.webhook, 1); assert.equal(minute.auth, 1); assert.equal(minute.clientErrors, 3); assert.equal(minute.serverErrors, 1); assert.equal(minute.aborted, 1); assert.equal(minute.averageMs, 31); assert.equal(minute.maxMs, 80); assert.equal(minute.p95UpperBoundMs, 100);
  assert.equal(result.minutes.length, 60); assert.ok(!/TOP-SECRET|919999999999|PRIVATE CONTENT|authorization/.test(JSON.stringify(result)));
});
test("HTTP counters maintain bounded second/minute history and distinguish active from complete", () => {
  let at = 0, duration = 0; const usage = createHttpUsage({ now: () => at, durationNow: () => duration });
  function begin() { const res = new EventEmitter(); res.statusCode = 200; res.writableFinished = true; usage.middleware({ url: "/api/system/usage?secret=never-store" }, res, () => {}); return res; }
  const active = begin(); assert.equal(usage.snapshot().activeRequests, 1); assert.equal(usage.snapshot().lastMinute.appRequests, 0); duration += 12; active.emit("finish");
  for (let i = 1; i <= 120; i++) { at += 60000; begin().emit("finish"); }
  const result = usage.snapshot(); assert.equal(result.lastMinute.appRequests, 1); assert.equal(result.lastHour.appRequests, 60); assert.equal(result.minutes.length, 60); assert.equal(result.completedSinceStart, 121);
  at += 3600001; const empty = usage.snapshot(); assert.equal(empty.lastHour.appRequests, 0); assert.equal(empty.lastMinute.averageMs, null); assert.equal(empty.lastMinute.p95UpperBoundMs, null); assert.ok(!JSON.stringify(empty).includes("secret="));
});
