import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const finite = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const percent = (used, total) => used != null && total > 0 ? Math.round(used / total * 1000) / 10 : null;
const parseNumber = text => typeof text === "string" && /^\d+$/.test(text.trim()) ? finite(Number(text.trim())) : null;
const limitNumber = text => { const n = parseNumber(text); return n > 0 && n < 2 ** 60 ? n : null; };
async function safeRead(file) { try { return (await fs.readFile(file, "utf8")).slice(0, 65536); } catch { return null; } }
const emptyCgroup = () => ({ source: null, memoryLimitBytes: null, memoryUsedBytes: null, cpuQuotaCores: null, cpuUsageUs: null });
const unescapeMount = text => text.replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));

// Resolve only this process's cgroup membership against the actual cgroup
// mounts. Never fall back to a host/root group just because its counters exist.
export function cgroupDirectories(membership = "", mounts = "") {
  const groups = String(membership || "").trim().split("\n").map(line => {
    const match = line.match(/^\d+:([^:]*):(.+)$/);
    return match ? { controllers: match[1].split(","), member: match[2] } : null;
  }).filter(Boolean);
  const result = {};
  for (const line of String(mounts || "").split("\n")) {
    const [before, after] = line.split(" - "); if (!after) continue;
    const fields = before.split(" "), [type, , options = ""] = after.split(" ");
    if (!["cgroup", "cgroup2"].includes(type) || fields.length < 5) continue;
    const root = unescapeMount(fields[3]), mount = unescapeMount(fields[4]);
    const controllers = options.split(",");
    for (const name of type === "cgroup2" ? ["unified"] : ["memory", "cpu", "cpuacct"]) {
      if (name !== "unified" && !controllers.includes(name)) continue;
      const group = groups.find(g => name === "unified" ? g.controllers.length === 1 && g.controllers[0] === "" : g.controllers.includes(name));
      if (!group || ![root, mount, group.member].every(p => p.startsWith("/") && !p.split("/").some(part => part === ".."))) continue;
      const member = path.posix.normalize(group.member), base = path.posix.normalize(root);
      if (member !== base && !member.startsWith(base === "/" ? "/" : `${base}/`)) continue;
      result[name] = path.posix.join(mount, path.posix.relative(base, member));
    }
  }
  return result;
}

// Only kernel metadata/counters are read. No user paths, subprocesses, OS-wide
// memory totals, process command lines, environment values or provider tokens.
export async function readCgroup(read = safeRead) {
  const [membership, mounts] = await Promise.all([read("/proc/self/cgroup"), read("/proc/self/mountinfo")]);
  const dirs = cgroupDirectories(membership, mounts);
  if (dirs.unified) {
    const [max, used, cpuMax, stat] = await Promise.all(["memory.max", "memory.current", "cpu.max", "cpu.stat"].map(name => read(`${dirs.unified}/${name}`)));
    const [quota, period] = String(cpuMax || "").trim().split(/\s+/).map(parseNumber);
    const cores = quota > 0 && period > 0 ? quota / period : null;
    const memoryLimitBytes = limitNumber(max);
    return { source: memoryLimitBytes || cores ? "cgroup-v2" : null, memoryLimitBytes, memoryUsedBytes: memoryLimitBytes ? parseNumber(used) : null, cpuQuotaCores: cores, cpuUsageUs: cores ? parseNumber(stat?.match(/^usage_usec\s+(\d+)/m)?.[1]) : null };
  }
  if (!dirs.memory && !dirs.cpu) return emptyCgroup();
  const readCounter = (dir, file) => dir ? read(`${dir}/${file}`) : Promise.resolve(null);
  const [limit, usage, quota, period, cpuUsage] = await Promise.all([
    readCounter(dirs.memory, "memory.limit_in_bytes"), readCounter(dirs.memory, "memory.usage_in_bytes"),
    readCounter(dirs.cpu, "cpu.cfs_quota_us"), readCounter(dirs.cpu, "cpu.cfs_period_us"), readCounter(dirs.cpuacct, "cpuacct.usage")
  ]);
  const q = parseNumber(quota), p = parseNumber(period), cores = q > 0 && p > 0 ? q / p : null, memoryLimitBytes = limitNumber(limit);
  return { source: memoryLimitBytes || cores ? "cgroup-v1" : null, memoryLimitBytes, memoryUsedBytes: memoryLimitBytes ? parseNumber(usage) : null, cpuQuotaCores: cores, cpuUsageUs: cores && parseNumber(cpuUsage) != null ? parseNumber(cpuUsage) / 1000 : null };
}

export function createRuntimeSampler({ now = Date.now, uptime = () => process.uptime(), cpuUsage = () => process.cpuUsage(), memoryUsage = () => process.memoryUsage(), eventLoop = () => performance.eventLoopUtilization(), cgroup = () => readCgroup() } = {}) {
  let previous, cached, until = 0, loading;
  return async function sample() {
    const time = now();
    if (cached && time < until) return cached;
    if (loading) return loading;
    loading = (async () => {
      const cg = await cgroup().catch(() => emptyCgroup());
      const at = now(), up = uptime(), cpu = cpuUsage(), mem = memoryUsage(), loop = eventLoop();
      // process.uptime is monotonic; wall-clock adjustments cannot turn a CPU
      // delta into a falsely negative or inflated interval.
      const windowMs = (previous ? up - previous.up : up) * 1000;
      const cpuUs = previous ? cpu.user + cpu.system - previous.cpu.user - previous.cpu.system : cpu.user + cpu.system;
      const oneCore = windowMs > 0 && cpuUs >= 0 ? cpuUs / (windowMs * 1000) * 100 : null;
      const cgroupUs = previous && cg.cpuUsageUs != null && previous.cg.cpuUsageUs != null && cg.cpuQuotaCores === previous.cg.cpuQuotaCores ? cg.cpuUsageUs - previous.cg.cpuUsageUs : null;
      const cgroupOneCore = cgroupUs >= 0 && cgroupUs != null && windowMs > 0 ? cgroupUs / (windowMs * 1000) * 100 : null;
      const active = previous ? loop.active - previous.loop.active : loop.active, idle = previous ? loop.idle - previous.loop.idle : loop.idle;
      const rounded = value => value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
      cached = {
        observedAt: new Date(at).toISOString(), uptimeSeconds: Math.floor(up), startedAt: new Date(at - up * 1000).toISOString(),
        cpu: { nodeOneCorePercent: rounded(oneCore), nodeQuotaPercent: cg.cpuQuotaCores > 0 && oneCore != null ? rounded(oneCore / cg.cpuQuotaCores) : null, cgroupOneCorePercent: rounded(cgroupOneCore), cgroupQuotaPercent: cg.cpuQuotaCores > 0 && cgroupOneCore != null ? rounded(cgroupOneCore / cg.cpuQuotaCores) : null, quotaCores: cg.cpuQuotaCores || null, windowSeconds: rounded(windowMs / 1000), window: previous ? "since previous sample" : "since Node process start", quotaSource: cg.cpuQuotaCores ? cg.source : null },
        memory: { nodeRssBytes: finite(mem.rss), heapUsedBytes: finite(mem.heapUsed), heapTotalBytes: finite(mem.heapTotal), externalBytes: finite(mem.external), arrayBuffersBytes: finite(mem.arrayBuffers), cgroupUsedBytes: cg.memoryUsedBytes ?? null, cgroupLimitBytes: cg.memoryLimitBytes ?? null, cgroupPercent: percent(cg.memoryUsedBytes, cg.memoryLimitBytes), nodeRssPercentOfLimit: percent(finite(mem.rss), cg.memoryLimitBytes), limitSource: cg.memoryLimitBytes ? cg.source : null },
        eventLoopBusyPercent: active >= 0 && idle >= 0 && active + idle > 0 ? percent(active, active + idle) : null,
        scope: "This backend Node process. Detected direct cgroup limits/counters, when exposed by the host, can also include child processes and cache. Ancestor-group limits, host-wide CPU/RAM totals and provider plan/billing metrics are not inferred."
      };
      previous = { up, cpu, cg, loop }; until = at + 5000;
      return cached;
    })().finally(() => { loading = undefined; });
    return loading;
  };
}
export const sampleRuntime = createRuntimeSampler();
