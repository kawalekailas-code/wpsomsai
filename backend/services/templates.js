import axios from "axios";
import crypto from "node:crypto";
import { graphUrl, metaHeaders, metaError } from "./whatsapp.js";
import { HttpError } from "../lib/utils.js";
let cached, until = 0, loading;
export function resetTemplateCache() { cached = undefined; until = 0; loading = undefined; }
const variables = text => [...new Set([...String(text || "").matchAll(/\{\{\s*([a-zA-Z_0-9]+)\s*\}\}/g)].map(m => m[1]))];
export function describeTemplate(t) {
  const components = t.components || [], body = components.find(c => c.type === "BODY"), header = components.find(c => c.type === "HEADER");
  const params = variables(body?.text);
  const parameterFormat = t.parameter_format || (params.some(p => !/^\d+$/.test(p)) ? "NAMED" : "POSITIONAL");
  if (parameterFormat === "POSITIONAL") params.sort((a, b) => Number(a) - Number(b));
  let unsupported = "";
  if (parameterFormat === "POSITIONAL" && params.some((p, i) => Number(p) !== i + 1)) unsupported = "Body parameters must use sequential positions starting at 1.";
  if (params.length > 10) unsupported = "More than 10 body parameters are not supported.";
  if (header && !["TEXT", "IMAGE", "VIDEO"].includes(header.format)) unsupported = "Only static text, image and MP4 video headers are supported.";
  if (header?.format === "TEXT" && variables(header.text).length) unsupported = "Dynamic text-header parameters are not supported.";
  if (components.some(c => !["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(c.type))) unsupported = "This template has an unsupported component.";
  if (components.some(c => c.type === "BUTTONS" && c.buttons?.some(b => !["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(b.type) || variables(b.url).length))) unsupported = "Dynamic/Flow/authentication buttons are not supported.";
  const signature = crypto.createHash("sha256").update(JSON.stringify({ components, parameterFormat })).digest("hex");
  return { name: t.name, language: t.language, status: t.status, header: header?.format || "NONE", headerText: header?.format === "TEXT" ? header.text || "" : "", buttons: components.find(c => c.type === "BUTTONS")?.buttons?.map(b => ({ type: b.type, text: b.text || "" })) || [], body: body?.text || "", footer: components.find(c => c.type === "FOOTER")?.text || "", params, parameterFormat, supported: !unsupported, unsupported, signature };
}
export async function approvedTemplates() {
  if (!process.env.WABA_ID) throw new HttpError(503, "Set WABA_ID privately on the backend to fetch approved templates.", "WABA_REQUIRED");
  if (cached && Date.now() < until) return cached;
  if (loading) return loading;
  loading = (async () => {
    try {
      let after, list = [];
      for (let page = 0; page < 10; page++) {
        const { data } = await axios.get(graphUrl(`${process.env.WABA_ID}/message_templates`), { headers: metaHeaders(), params: { fields: "name,language,status,components,parameter_format", limit: 100, ...(after ? { after } : {}) }, timeout: 15000 });
        list.push(...(data.data || []).filter(t => t.status === "APPROVED").map(describeTemplate));
        if (!data.paging?.next) break;
        after = data.paging?.cursors?.after;
        if (!after || page === 9) throw new HttpError(502, "Template list is too large or pagination is incomplete. No send was started.");
      }
      cached = list; until = Date.now() + 60000; return list;
    } catch (err) { throw err instanceof HttpError ? err : metaError(err); }
    finally { loading = undefined; }
  })();
  return loading;
}
export async function findTemplate(name, language) {
  const t = (await approvedTemplates()).find(t => t.name === name && t.language === language);
  if (!t) throw new HttpError(400, "Select a currently APPROVED template and its exact language.");
  if (!t.supported) throw new HttpError(400, t.unsupported);
  return t;
}
export function compileTemplate(t, input = {}, media) {
  const params = input.parameters || [];
  if (!Array.isArray(params) || params.length !== t.params.length || params.some(p => typeof p !== "string" || !p.trim() || p.length > 1024)) throw new HttpError(400, `Provide exactly ${t.params.length} nonempty body parameters, each at most 1024 characters.`);
  const template = { name: t.name, language: { code: t.language } }, components = [];
  if (["IMAGE", "VIDEO"].includes(t.header)) {
    if (!media || media.type.toUpperCase() !== t.header) throw new HttpError(400, `Upload a ${t.header.toLowerCase()} for this template first.`);
    components.push({ type: "header", parameters: [{ type: media.type, [media.type]: { id: media.mediaId } }] });
  }
  if (params.length) components.push({ type: "body", parameters: params.map((text, i) => ({ type: "text", text: text.trim(), ...(t.parameterFormat === "NAMED" ? { parameter_name: t.params[i] } : {}) })) });
  if (components.length) template.components = components;
  const text = t.body.replace(/\{\{\s*([a-zA-Z_0-9]+)\s*\}\}/g, (match, key) => params[t.params.indexOf(key)]?.trim() || match);
  return { template, text: (text || `Template: ${t.name}`).slice(0, 4096) };
}
