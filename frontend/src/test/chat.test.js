import { describe, it, expect } from "vitest";
import { initials, avatarColor, messagePreview, replyWindow, upsertMessage } from "../lib/chat.js";
import { makeDemoService } from "../lib/demo.js";

const memory = () => { const m = new Map(); return { getItem: k => m.get(k), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const make = () => makeDemoService({ storage: memory(), delay: 0 });

describe("chat utilities", () => {
  it("uses stable initials and colors", () => { expect(initials("Neha Patil")).toBe("NP"); expect(initials("")).toBe(""); expect(avatarColor("Aai")).toBe(avatarColor("Aai")); });
  it("does not open a session because an outbound message was sent", () => { const now = Date.now(); expect(replyWindow(new Date(now - 86400001), now).open).toBe(false); expect(replyWindow(new Date(now - 3600000), now).open).toBe(true); expect(replyWindow(undefined, now).open).toBe(false); });
  it("deduplicates messages by database ID", () => { const m = { _id: "one", createdAt: new Date().toISOString(), status: "sent" }; expect(upsertMessage([m], { ...m, status: "seen" })).toEqual([{ ...m, status: "seen" }]); });
  it("previews rich message types", () => { expect(messagePreview({ type: "location", location: { name: "Meeting point" } })).toContain("Meeting point"); expect(messagePreview({ media: true, type: "image" })).toBe("📷 Photo"); });
});
describe("explicit demo adapter (never calls the real API)", () => {
  it("filters unread and archived contacts", async () => { const api = make(); const all = await api.contacts(); const unread = await api.contacts({ filter: "unread" }); const archived = await api.contacts({ filter: "archived" }); expect(all.contacts).toHaveLength(6); expect(unread.contacts.every(c => c.hasUnread)).toBe(true); expect(archived.contacts).toHaveLength(1); });
  it("sends, quotes, reacts, stars and hides a message", async () => {
    const api = make(), phone = "919000000001";
    const history = await api.messages(phone); const parent = history.messages[0];
    const message = await api.sendText({ phone, message: "Test reply", replyToId: parent._id, clientId: "client_test_0000001" });
    expect(message.context.messageId).toBe(parent._id);
    const repeat = await api.sendText({ phone, message: "Test reply", clientId: "client_test_0000001" }); expect(repeat._id).toBe(message._id);
    expect((await api.react(message._id, "👍")).reactions.self).toBe("👍");
    await api.starMessage(message._id, true); expect((await api.starred()).messages.some(m => m._id === message._id)).toBe(true);
    await api.deleteMessage(message._id); expect((await api.messages(phone)).messages.some(m => m._id === message._id)).toBe(false);
  });
  it("enforces the reply window and permits a template without reopening it", async () => {
    const api = make(), phone = "919000000006";
    await expect(api.sendText({ phone, message: "Not allowed" })).rejects.toThrow("24-hour");
    const m = await api.sendTemplate({ phone, name: "demo_greeting", parameters: ["Tanvi"] }); expect(m.type).toBe("template");
    await expect(api.sendText({ phone, message: "Still not allowed" })).rejects.toThrow("24-hour");
  });
  it("keeps local archive and read actions functional", async () => {
    const api = make(), phone = "919000000001";
    await api.readChat(phone); expect((await api.contact(phone)).hasUnread).toBe(false);
    await api.chatState(phone, { archived: true }); expect((await api.contacts()).contacts.some(c => c.phone === phone)).toBe(false);
    expect((await api.contacts({ filter: "archived" })).contacts.some(c => c.phone === phone)).toBe(true);
  });
  it("clears stars and history for a local clear", async () => { const api = make(), phone = "919000000001"; await api.clearChat(phone); expect((await api.messages(phone)).messages).toHaveLength(0); expect((await api.starred()).messages.filter(m => m.phone === phone)).toHaveLength(0); });
  it("shares a native-shaped location and a contact card", async () => { const api = make(), phone = "919000000001"; const m = await api.sendLocation({ phone, latitude: "19.1", longitude: "74.7", name: "Meeting spot" }); expect(m.location.latitude).toBe(19.1); const c = await api.sendContact({ phone, name: "Friend", sharedPhone: "+91 98765 43210" }); expect(c.contacts[0].phone).toBe("919876543210"); });
  it("preserves starred state across demo reloads", async () => { const storage = memory(); const one = makeDemoService({ storage, delay: 0 }); const m = (await one.messages("919000000001")).messages[0]; await one.starMessage(m._id, true); const two = makeDemoService({ storage, delay: 0 }); expect((await two.message(m._id)).starred).toBe(true); });
});
