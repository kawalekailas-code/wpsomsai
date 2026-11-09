import axios from "axios";
import { makeDemoService } from "./demo.js";
import { uid } from "./chat.js";

export const API_URL = (import.meta.env.REACT_APP_API || import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const getToken = () => { try { return localStorage.getItem("crm_token") || ""; } catch { return ""; } };
export function clearSession() { try { localStorage.removeItem("crm_token"); localStorage.removeItem("crm_user"); } catch { /* Storage may be disabled. */ } }

export function makeService(demo = false) {
  if (demo) return makeDemoService();
  const http = axios.create({ baseURL: API_URL, timeout: 75000 });
  http.interceptors.request.use(config => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    config.sessionToken = token;
    return config;
  });
  http.interceptors.response.use(value => {
    if (value.config.responseType !== "blob" && typeof value.data === "string" && /^\s*</.test(value.data)) {
      throw new Error("The API returned a web page instead of JSON. Set REACT_APP_API to your backend origin, then rebuild the frontend.");
    }
    return value;
  }, async err => {
    if (err.response?.status === 401 && err.config?.sessionToken && err.config.sessionToken === getToken() && !err.config?.url?.includes("/auth/login")) window.dispatchEvent(new Event("omsai:unauthorized"));
    let data = err.response?.data;
    if (data instanceof Blob) { try { data = JSON.parse(await data.text()); } catch { data = null; } }
    const error = new Error(data?.error || (err.code === "ECONNABORTED" ? "The server is taking too long. Render may be waking up; please wait and retry." : "Unable to connect. Check your connection and API configuration."));
    error.code = data?.code; error.messageId = data?.messageId;
    throw error;
  });
  const get = (url, params) => http.get(url, { params }).then(r => r.data);
  const post = (url, data) => http.post(url, data).then(r => r.data);
  const patch = (url, data) => http.patch(url, data).then(r => r.data);
  const send = (path, data) => post(`/api/send${path}`, { ...data, clientId: data.clientId || uid() });
  return {
    demo: false,
    checkSetup: () => get("/auth/check-setup"),
    login: async (username, password) => {
      const result = await post("/auth/login", { username, password });
      localStorage.setItem("crm_token", result.token); localStorage.setItem("crm_user", JSON.stringify(result.user));
      return result;
    },
    register: (data, key) => http.post("/auth/register", data, { headers: { "x-setup-key": key } }).then(r => r.data),
    me: () => get("/auth/me"),
    config: () => get("/api/config"),
    patchMe: data => patch("/api/me", data),
    contacts: params => get("/api/contacts", params),
    contact: phone => get(`/api/contacts/${phone}`),
    addContact: data => post("/api/contacts", data),
    editContact: (phone, data) => patch(`/api/contacts/${phone}`, data),
    chatState: (phone, data) => patch(`/api/chats/${phone}`, data),
    readChat: phone => post(`/api/chats/${phone}/read`),
    clearChat: phone => post(`/api/chats/${phone}/clear`),
    deleteChat: phone => http.delete(`/api/chats/${phone}`).then(r => r.data),
    messages: (phone, before, around) => get(`/api/messages/${phone}`, { before, around }),
    message: id => get(`/api/message/${id}`),
    search: (q, phone) => get("/api/search-messages", { q, phone }),
    starred: before => get("/api/starred", { before }),
    gallery: (phone, kind, before) => get(`/api/chats/${phone}/shared`, { kind, before, limit: 12 }),
    starMessage: (id, starred) => patch(`/api/messages/${id}/star`, { starred }),
    deleteMessage: id => http.delete(`/api/messages/${id}`).then(r => r.data),
    react: (id, emoji) => post(`/api/messages/${id}/reaction`, { emoji }),
    sendText: data => send("", data),
    sendMedia: data => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ ...data, clientId: data.clientId || uid() })) if (value !== undefined && value !== null) form.append(key, value);
      return post("/api/send/media", form);
    },
    sendLocation: data => send("/location", data),
    sendContact: data => send("/contact", data),
    forward: data => send("/forward", data),
    templates: () => get("/api/templates"),
    sendTemplate: data => send("/template", data),
    media: id => http.get(`/api/media/${id}`, { responseType: "blob" }).then(r => r.data),
    exportChat: phone => http.get(`/api/chats/${phone}/export`, { responseType: "blob" }).then(r => r.data),
    changePassword: async data => { const result = await post("/auth/change-password", data); clearSession(); window.dispatchEvent(new CustomEvent("omsai:unauthorized", { detail: { message: "Password changed. Please sign in with your new password." } })); return result; }
  };
}
