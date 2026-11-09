export const EMOJI = ["😊", "😂", "❤️", "🙏", "👍", "🎉", "😍", "🥰", "😎", "🤗", "👋", "✨", "💚", "🔥", "🙌", "👌", "😅", "🥳", "🤔", "👀", "💯", "✅", "☕", "🌿", "🌸", "🌞", "🌈", "💫", "🍕", "🎂", "🎁", "📷", "🏡", "🚗", "💪", "🤝", "😢", "😮", "🤩", "🫶", "😴", "🫡", "🎶", "📍", "🕊️", "💛", "🐾", "🌻"];
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const uid = () => globalThis.crypto?.randomUUID?.() || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 16)}`;
export function initials(name = "?") { return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase(); }
export function avatarColor(name = "") {
  const colors = ["#d9e9df", "#f0dfce", "#dfe3f4", "#e9dfed", "#d6e7ec", "#eee5c9", "#e2e8d2"];
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
export const formatTime = date => date ? new Date(date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase() : "";
export function dayLabel(value) {
  const d = new Date(value), today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}
export function sidebarTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return d.toDateString() === new Date().toDateString() ? formatTime(d) : dayLabel(d) === "Yesterday" ? "Yesterday" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function formatPhone(value = "") {
  const n = value.replace(/\D/g, "");
  return n.startsWith("91") && n.length === 12 ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : `+${n}`;
}
export function messagePreview(m) {
  if (!m) return "";
  if (m.type === "location") return `📍 ${m.location?.name || "Location"}`;
  if (m.type === "contacts") return `👤 ${m.contacts?.[0]?.name || "Contact"}`;
  if (m.media) return m.caption || ({ image: "📷 Photo", video: "🎬 Video", audio: "🎙 Voice / audio", document: "📎 Document", sticker: "Sticker" }[m.type] || "Attachment");
  return m.message || "";
}
export function upsertMessage(messages, message) {
  const index = messages.findIndex(m => m._id === message._id);
  const next = [...messages];
  if (index >= 0) next[index] = { ...next[index], ...message };
  else next.push(message);
  return next.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id)));
}
export const isMuted = contact => Boolean(contact?.mutedUntil && new Date(contact.mutedUntil) > new Date());
export function replyWindow(lastInboundAt, now = Date.now()) {
  if (!lastInboundAt) return { open: false, label: "Reply window closed", remaining: 0 };
  const remaining = new Date(lastInboundAt).getTime() + 86400000 - now;
  if (remaining <= 0) return { open: false, label: "Reply window closed", remaining: 0 };
  const h = Math.floor(remaining / 3600000), m = Math.ceil((remaining % 3600000) / 60000);
  return { open: true, label: `${h}h ${m}m reply window`, remaining };
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function playNotification() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    const ctx = new Context(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.type = "sine"; oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.03, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscillator.start(); oscillator.stop(ctx.currentTime + 0.15); oscillator.onended = () => ctx.close();
  } catch { /* Audio may be blocked until the user interacts. */ }
}
