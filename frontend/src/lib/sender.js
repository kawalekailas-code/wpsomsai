export function senderTotals(counts = {}) {
  const n = key => counts[key] || 0;
  return { pending: n("pending") + n("leased") + n("sending"), accepted: n("accepted") + n("delivered") + n("seen") + n("played"), delivered: n("delivered") + n("seen") + n("played"), failed: n("failed"), uncertain: n("uncertain"), cancelled: n("cancelled") + n("reviewed") };
}
export function mergeCatchUp(previous, update, { around = false } = {}) {
  const removed = new Set(update.removed || []);
  const map = new Map(previous.filter(m => !removed.has(m._id) && (!update.clearedAt || new Date(m.receivedAt || m.createdAt) > new Date(update.clearedAt))).map(m => [m._id, m]));
  for (const m of update.messages || []) if (!around || map.has(m._id)) map.set(m._id, { ...map.get(m._id), ...m });
  return [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id)));
}
