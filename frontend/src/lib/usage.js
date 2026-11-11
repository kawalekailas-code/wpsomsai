export const number = value => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Unavailable";
export function bytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"]; let n = value / 1024, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}
export const percent = value => typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "Unavailable";
export function uptime(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Unavailable";
  const seconds = Math.floor(value), days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24, minutes = Math.floor(seconds / 60) % 60;
  return days ? `${days}d ${hours}h ${minutes}m` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}
export function statesTotal(states, keys) { return states == null ? null : keys.reduce((sum, key) => sum + (Number.isFinite(states[key]) ? states[key] : 0), 0); }
export function cpuDisplay(runtime = {}) {
  const cpu = runtime.cpu || {};
  if (cpu.cgroupQuotaPercent != null) return { value: cpu.cgroupQuotaPercent, scope: "Limited cgroup", basis: `${cpu.quotaCores} core quota` };
  if (cpu.nodeQuotaPercent != null) return { value: cpu.nodeQuotaPercent, scope: "Node process", basis: `${cpu.quotaCores} core quota` };
  return { value: cpu.nodeOneCorePercent ?? null, scope: "Node process", basis: "one core; quota unavailable" };
}
