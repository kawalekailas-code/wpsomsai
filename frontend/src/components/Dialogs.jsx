import React, { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Send, Search, ArrowRight, ShieldAlert, Download, Copy, CheckCheck, Clock3, X } from "lucide-react";
import { Avatar, EmptyState, Field, IconButton, Modal, Spinner, useDialogFocus } from "./ui.jsx";
import { dayLabel, formatPhone, formatTime, messagePreview } from "../lib/chat.js";
import { MapPreview } from "./Message.jsx";

export function ContactDialog({ initial = {}, onClose, onSave, title = "New chat" }) {
  const [name, setName] = useState(initial.name || ""), [phone, setPhone] = useState(initial.phone ? `+${initial.phone}` : "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Modal title={title} onClose={onClose}><p className="muted dialog-intro">Add a name and a phone number. Existing personal WhatsApp contacts are not imported automatically.</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await onSave({ name, phone }); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>
    <Field label="Contact name"><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Neha Patil" /></Field>
    <Field label="Phone number" hint="Include the country code, e.g. +91. A new contact needs to message you before you can send a free-form reply."><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" required maxLength={22} /></Field>
    {error && <div className="inline-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <Spinner small /> : <ArrowRight size={17} />}{title === "New chat" ? "Start chat" : "Save contact"}</button></div>
  </form></Modal>;
}
export function ConfirmDialog({ title, text, actionLabel = "Continue", danger, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Modal title={title} onClose={() => { if (!busy) onClose(); }}><p className="confirmation-text">{text}</p>{error && <div className="inline-error">{error}</div>}<div className="form-actions"><button className="button ghost" disabled={busy} onClick={onClose}>Cancel</button><button className={`button ${danger ? "destructive" : "primary"}`} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (err) { setError(err.message); setBusy(false); } }}>{busy && <Spinner small />}{actionLabel}</button></div></Modal>;
}
export function ForwardDialog({ message, api, onClose, onDone }) {
  const [q, setQ] = useState(""), [contacts, setContacts] = useState([]), [selected, setSelected] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setLoading(true);
    const timer = setTimeout(() => Promise.all([api.contacts({ q, filter: "all" }), api.contacts({ q, filter: "archived" })]).then(([a, b]) => { if (active) setContacts([...a.contacts, ...b.contacts]); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); }), 180);
    return () => { active = false; clearTimeout(timer); };
  }, [q, api]);
  return <Modal title="Forward message" onClose={onClose}><div className="forward-preview">{messagePreview(message)}</div><p className="muted small-text">Sends a new copy to one chat, without WhatsApp's native forwarded marker. The recipient must have an open reply window.</p><div className="search-field"><Search size={17} /><input autoFocus placeholder="Search contacts" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="recipient-list">{loading ? <div className="loading-line"><Spinner /></div> : contacts.map(c => <button key={c.phone} className={selected?.phone === c.phone ? "selected" : ""} onClick={() => setSelected(c)}><Avatar name={c.name || c.phone} size={38} /><span><strong>{c.name || formatPhone(c.phone)}</strong><small>{formatPhone(c.phone)}{c.archived ? " · Archived" : ""}</small></span><span className="radio-dot" /></button>)}{!loading && !contacts.length && <EmptyState title="No contacts found" />}</div>
    {error && <div className="inline-error">{error}</div>}<div className="form-actions"><button className="button primary" disabled={!selected || busy} onClick={async () => { setBusy(true); setError(""); try { const m = await api.forward({ phone: selected.phone, messageId: message._id }); onDone(m, selected); } catch (err) { setError(err.message); setBusy(false); } }}>{busy ? <Spinner small /> : <Send size={16} />}Forward</button></div></Modal>;
}
export function LocationDialog({ onClose, onSend }) {
  const [latitude, setLat] = useState(""), [longitude, setLon] = useState(""), [name, setName] = useState(""), [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  function locate() {
    if (!navigator.geolocation) return setError("Location is unavailable. Enter coordinates manually.");
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition(pos => { setLat(pos.coords.latitude.toFixed(6)); setLon(pos.coords.longitude.toFixed(6)); setName("Current location"); setLocating(false); }, () => { setError("Location permission was denied or unavailable. Enter coordinates manually."); setLocating(false); }, { timeout: 12000, enableHighAccuracy: true });
  }
  return <Modal title="Share a location" onClose={onClose}><MapPreview /><p className="muted small-text">The map is illustrative. Coordinates are sent as a native WhatsApp location message. This does not enable live location tracking.</p><button className="button secondary full" onClick={locate} disabled={locating}>{locating ? <Spinner small /> : <Navigation size={16} />}Use current location</button>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await onSend({ latitude, longitude, name, address }); } catch (err) { setError(err.message); setBusy(false); } }}><div className="field-grid"><Field label="Latitude"><input required inputMode="decimal" type="number" min="-90" max="90" step="any" value={latitude} onChange={e => setLat(e.target.value)} /></Field><Field label="Longitude"><input required inputMode="decimal" type="number" min="-180" max="180" step="any" value={longitude} onChange={e => setLon(e.target.value)} /></Field></div><Field label="Place name (optional)"><input value={name} onChange={e => setName(e.target.value)} maxLength={100} /></Field><Field label="Address (optional)"><input value={address} onChange={e => setAddress(e.target.value)} maxLength={300} /></Field>{error && <div className="inline-error">{error}</div>}<div className="form-actions"><button className="button primary" disabled={busy}>{busy ? <Spinner small /> : <MapPin size={16} />}Send location</button></div></form></Modal>;
}
export function ShareContactDialog({ contacts, onClose, onSend }) {
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Modal title="Share a contact" onClose={onClose}><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSend({ name, sharedPhone: phone }); } catch (err) { setError(err.message); setBusy(false); } }}><Field label="Choose from this app (optional)"><select defaultValue="" onChange={e => { const c = contacts.find(c => c.phone === e.target.value); if (c) { setName(c.name); setPhone(`+${c.phone}`); } }}><option value="">Choose a contact…</option>{contacts.map(c => <option key={c.phone} value={c.phone}>{c.name || c.phone}</option>)}</select></Field><Field label="Name"><input value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></Field><Field label="Phone number"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+91 …" /></Field>{error && <div className="inline-error">{error}</div>}<div className="form-actions"><button className="button primary" disabled={busy}>{busy ? <Spinner small /> : <Send size={16} />}Share contact</button></div></form></Modal>;
}
export function TemplateDialog({ contact, api, onClose, onSent }) {
  const [templates, setTemplates] = useState([]), [name, setName] = useState(""), [language, setLanguage] = useState("en"), [parameters, setParameters] = useState([]), [manual, setManual] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let alive = true; api.templates().then(result => { if (alive) { setTemplates(result.templates); setManual(result.manualEntry || !result.templates.length); } }).catch(err => { if (alive) { setError(err.message); setManual(true); } }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [api]);
  const selected = templates.find(t => t.name === name && t.language === language);
  const body = selected?.components?.find(c => c.type === "BODY")?.text || "";
  const count = Math.min(10, Math.max(0, ...[...body.matchAll(/{{(\d+)}}/g)].map(m => Number(m[1]))));
  const unsupported = selected?.components?.some(c => {
    if (c.type === "HEADER") return c.format !== "TEXT" || /{{/.test(c.text || "");
    if (c.type === "BUTTONS") return c.buttons?.some(b => /{{/.test(b.url || ""));
    return false;
  });
  function choose(value) { const t = templates.find(t => `${t.name}|${t.language}` === value); if (t) { setName(t.name); setLanguage(t.language); setParameters([]); } }
  return <Modal title="Continue the conversation" onClose={onClose}><div className="notice"><ShieldAlert size={20} /><p>The Cloud API allows free-form replies only within 24 hours of a contact's message. Outside that window, use an approved template or ask them to message you.</p></div><p className="muted small-text">Sending to <strong>{contact.name || formatPhone(contact.phone)}</strong>. Meta may charge for templates; obtain permission before initiating messages.</p>
    {loading ? <div className="loading-line"><Spinner /></div> : <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const m = await api.sendTemplate({ phone: contact.phone, name, language, parameters: parameters.filter(v => typeof v === "string") }); onSent(m); } catch (err) { setError(err.message); setBusy(false); } }}>
      {templates.length > 0 && <Field label="Approved template"><select value={selected ? `${name}|${language}` : ""} onChange={e => choose(e.target.value)} required={!manual}><option value="">Select a template…</option>{templates.map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language}</option>)}</select></Field>}
      {manual && <><Field label="Exact approved template name"><input required value={name} onChange={e => setName(e.target.value)} pattern="[a-z0-9_]+" placeholder="your_approved_template" /></Field><Field label="Language code"><input required value={language} onChange={e => setLanguage(e.target.value)} placeholder="en / en_US / mr" /></Field></>}
      {body && <div className="template-preview">{body}</div>}{unsupported && <div className="inline-error">This template uses a media header or dynamic buttons that this chat composer does not support. Choose a text-body template instead.</div>}
      {count > 0 ? Array.from({ length: count }, (_, i) => <Field label={`Body variable {{${i + 1}}}`} key={i}><input required value={parameters[i] || ""} onChange={e => setParameters(values => { const next = [...values]; next[i] = e.target.value; return next; })} maxLength={1024} /></Field>) : manual && <Field label="Body variables (optional)" hint="One value per line, in {{1}}, {{2}} order. Text body variables only."><textarea rows={2} value={parameters.join("\n")} onChange={e => setParameters(e.target.value ? e.target.value.split("\n") : [])} /></Field>}
      {error && <div className="inline-error">{error}</div>}<div className="form-actions"><button className="button primary" disabled={busy || unsupported || !name}>{busy ? <Spinner small /> : <Send size={16} />}Send approved template</button></div>
    </form>}</Modal>;
}
export function MessageInfo({ message: m, onClose }) {
  const value = date => date ? `${dayLabel(date)} at ${formatTime(date)}` : "Not available";
  return <Modal title="Message info" onClose={onClose}><div className="info-preview">{messagePreview(m)}</div><dl className="info-list"><div><dt><Clock3 size={17} />{m.direction === "incoming" ? "WhatsApp event time" : "Created in app"}</dt><dd>{value(m.createdAt)}</dd></div>{m.direction === "incoming" && m.receivedAt && <div><dt>Stored in app</dt><dd>{value(m.receivedAt)}</dd></div>}{m.direction === "outgoing" && <><div><dt><CheckCheck size={17} />Delivered</dt><dd>{value(m.deliveredAt)}</dd></div><div><dt><CheckCheck size={17} className="read-icon" />Read</dt><dd>{value(m.readAt)}</dd></div>{m.voice && <div><dt>Played</dt><dd>{value(m.playedAt)}</dd></div>}</>}<div><dt>Status</dt><dd className="capitalize">{m.status}</dd></div>{m.mediaExpiresAt && <div><dt>Media available until</dt><dd>{value(m.mediaExpiresAt)} (estimated)</dd></div>}</dl>{m.error && <p className="inline-error">{m.error}</p>}<p className="muted small-text">Only events supplied by the Cloud API are shown. Missing timestamps are not inferred.</p>{m.waMessageId && <code className="message-id">{m.waMessageId}</code>}</Modal>;
}
export function ImageViewer({ image, onClose, onDownload }) {
  const ref = useRef(null);
  useDialogFocus(ref, onClose);
  return <div ref={ref} className="image-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={e => { if (e.target === e.currentTarget) onClose(); }} tabIndex={-1}><header><span>{image.message.filename || "Photo"}</span><div><IconButton label="Download photo" onClick={onDownload}><Download size={21} /></IconButton><IconButton label="Close photo viewer" onClick={onClose} data-dialog-focus><X size={23} /></IconButton></div></header><img src={image.url} alt={image.message.caption || "Shared photo"} /><p>{image.message.caption}</p></div>;
}
