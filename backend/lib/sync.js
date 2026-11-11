import { HttpError, objectId } from "./utils.js";
export function syncCheckpoint(date = new Date()) { return Buffer.from(JSON.stringify({ t: new Date(date).toISOString() })).toString("base64url"); }
export function syncAfter(value) {
  try {
    if (typeof value !== "string" || value.length > 250) throw new Error();
    const p = JSON.parse(Buffer.from(value, "base64url").toString()), t = new Date(p.t);
    if (!Number.isFinite(t.getTime()) || t.getTime() > Date.now() + 60000) throw new Error();
    return p.id ? { $or: [{ updatedAt: { $gt: t } }, { updatedAt: t, _id: { $gt: objectId(p.id) } }] } : { updatedAt: { $gte: t } };
  } catch { throw new HttpError(400, "Invalid catch-up cursor."); }
}
export function syncNext(m) { return Buffer.from(JSON.stringify({ t: m.updatedAt.toISOString(), id: String(m._id) })).toString("base64url"); }
