import axios from "axios";
import FormData from "form-data";
import fs from "node:fs";
import { HttpError } from "../lib/utils.js";

export const apiVersion = () => process.env.WHATSAPP_API_VERSION || "v25.0";
export const graphUrl = path => `https://graph.facebook.com/${apiVersion()}/${path}`;
export const metaHeaders = () => ({ Authorization: `Bearer ${process.env.TOKEN}` });

export function metaError(err) {
  const details = err.response?.data?.error;
  const code = details?.code;
  if (code === 131047) return new HttpError(409, "The 24-hour reply window has closed. Use an approved template to continue.", "WINDOW_CLOSED");
  if ([190, 102].includes(code)) return new HttpError(502, "The WhatsApp access token needs to be renewed by the administrator.", "META_AUTH");
  if (code === 130429 || err.response?.status === 429) return new HttpError(429, "WhatsApp is rate limiting messages. Please try again later.", "META_RATE_LIMIT");
  const uncertain = ["ECONNABORTED", "ETIMEDOUT", "ECONNRESET"].includes(err.code);
  return new HttpError(502, uncertain ? "Delivery could not be confirmed. Check the recipient before retrying; a retry may send a duplicate." : (details?.error_data?.details || details?.message || "WhatsApp could not complete this action. Check your number, permissions and API configuration."), uncertain ? "DELIVERY_UNCERTAIN" : "META_ERROR");
}

export async function sendPayload(phone, payload) {
  try {
    const { data } = await axios.post(graphUrl(`${process.env.PHONE_ID}/messages`), {
      messaging_product: "whatsapp", recipient_type: "individual", to: phone, ...payload
    }, { headers: metaHeaders(), timeout: 25000 });
    const id = data.messages?.[0]?.id;
    if (!id) throw new HttpError(502, "WhatsApp did not return a message ID.", "DELIVERY_UNCERTAIN");
    return id;
  } catch (err) { throw err instanceof HttpError ? err : metaError(err); }
}

export async function markRead(waMessageId) {
  try {
    await axios.post(graphUrl(`${process.env.PHONE_ID}/messages`), {
      messaging_product: "whatsapp", status: "read", message_id: waMessageId
    }, { headers: metaHeaders(), timeout: 10000 });
  } catch (err) { throw metaError(err); }
}

export async function uploadMedia(filePath, mimeType, filename) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", fs.createReadStream(filePath), { contentType: mimeType, filename });
  try {
    const { data } = await axios.post(graphUrl(`${process.env.PHONE_ID}/media`), form, {
      headers: { ...metaHeaders(), ...form.getHeaders() }, maxBodyLength: 18 * 1024 * 1024, timeout: 45000
    });
    if (!data.id) throw new HttpError(502, "WhatsApp did not return a media ID.");
    return data.id;
  } catch (err) { throw err instanceof HttpError ? err : metaError(err); }
}

export async function mediaInfo(mediaId) {
  try {
    const { data } = await axios.get(graphUrl(encodeURIComponent(mediaId)), { headers: metaHeaders(), timeout: 15000 });
    const url = new URL(data.url);
    const allowed = ["fbsbx.com", "fbcdn.net", "facebook.com", "whatsapp.net"];
    if (url.protocol !== "https:" || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new HttpError(502, "Unexpected media download host.");
    }
    if (Number(data.file_size) > 16 * 1024 * 1024) throw new HttpError(413, "This attachment exceeds the app's 16 MB download limit.");
    return data;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(410, "This attachment is no longer available from WhatsApp. Ask the sender to share it again.", "MEDIA_EXPIRED");
  }
}
