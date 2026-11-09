import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, UsersRound, UserPlus, Upload, Download, Search, Pencil, Trash2, MessageCircle, Check, FileUp, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, EmptyState, Field, IconButton, Modal, Spinner } from "./ui.jsx";
import { downloadBlob, formatPhone } from "../lib/chat.js";
import { csvText, readContactFile } from "../lib/contact-files.js";

const ACTIONS = { create: "New", restore: "Save again", update: "Update", skip: "Already saved", duplicate: "File duplicate", invalid: "Invalid" };

function ContactEditor({ contact, api, onSaved, onBack, busy, setBusy }) {
  const [name, setName] = useState(contact?.name || ""), [phone, setPhone] = useState(contact?.phone ? `+${contact.phone}` : ""), [notes, setNotes] = useState(contact?.notes || ""), [error, setError] = useState("");
  return <form className="contact-editor" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (contact) await api.editContact(contact.phone, { name, notes });
      else await api.addContact({ name, phone, notes, startChat: false });
      onSaved(contact ? "Contact updated" : "Contact added. No message was sent.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }}>
    <button className="text-link small-text" type="button" disabled={busy} onClick={onBack}><ArrowLeft size={16} />Back to contacts</button>
    <p className="muted small-text">Names and notes are shared with authorized workspace users, not synced to a personal phone address book.</p>
    <Field label="Contact name"><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Neha Patil" /></Field>
    <Field label="Phone number" hint={contact ? "The number identifies this chat and cannot be changed. Add a new contact for another number." : "Include +country code. A 10-digit number defaults to India (+91)."}><input type="tel" value={phone} readOnly={Boolean(contact)} onChange={e => setPhone(e.target.value)} maxLength={60} placeholder="+91 98765 43210" required /></Field>
    <Field label="Workspace contact note" hint="Never sent as a WhatsApp message."><textarea rows={4} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="Something to remember…" /></Field>
    {!contact && <p className="contact-policy"><MessageCircle size={16} />Saving a contact does not start a conversation, verify WhatsApp registration, or open the 24-hour reply window.</p>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    <div className="form-actions"><button type="button" className="button ghost" disabled={busy} onClick={onBack}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <Spinner small /> : <Check size={16} />}{contact ? "Save changes" : "Save contact"}</button></div>
  </form>;
}

function ContactsImport({ api, onBack, onChanged, toast, busy, setBusy }) {
  const fileRef = useRef(null), fileRequest = useRef(0);
  const [rows, setRows] = useState([]), [filename, setFilename] = useState(""), [reading, setReading] = useState(false), [mode, setMode] = useState("skip"), [preview, setPreview] = useState(null), [error, setError] = useState(""), [report, setReport] = useState(null), [show, setShow] = useState("all");
  useEffect(() => () => { fileRequest.current++; }, []);
  async function pick(file) {
    if (!file) return;
    const request = ++fileRequest.current;
    setReading(true); setRows([]); setPreview(null); setReport(null); setError(""); setFilename(file.name);
    try { const parsed = await readContactFile(file); if (request === fileRequest.current) setRows(parsed); }
    catch (err) { if (request === fileRequest.current) setError(err.message); }
    finally { if (request === fileRequest.current) setReading(false); }
  }
  const ready = preview ? preview.summary.create + preview.summary.restore + preview.summary.update : 0;
  const visible = preview?.rows.filter(r => show === "all" || show === "invalid" && r.action === "invalid" || show === "skipped" && ["skip", "duplicate"].includes(r.action)) || [];
  return <div className="contacts-import">
    <button type="button" className="text-link small-text" disabled={busy} onClick={onBack}><ArrowLeft size={16} />Back to contacts</button>
    <p className="muted small-text">Import CSV or vCard/VCF. Up to <strong>512 KB and 500 phone entries</strong> per file. The file is read in your browser; only name, phone and note fields are sent to this workspace for validation.</p>
    <div className="contact-samples"><span>Need a format?</span><a href="/samples/contacts.csv" download><Download size={14} />CSV sample</a><a href="/samples/contacts.vcf" download><Download size={14} />VCF sample</a></div>
    <button type="button" className="contact-upload-zone" disabled={busy || reading} onClick={() => fileRef.current?.click()}>{reading ? <Spinner /> : <FileUp size={32} />}<strong>{filename || "Choose a contacts file"}</strong><span>{rows.length ? `${rows.length} phone entries read · preview before saving` : ".csv or .vcf · UTF-8 · no Excel .xlsx"}</span></button>
    <input ref={fileRef} type="file" accept=".csv,.vcf,text/csv,text/vcard" aria-label="Choose contacts file" className="visually-hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    <Field label="If a number is already saved" hint="Repeated numbers inside one file always use the first valid occurrence. Blank imported fields never erase existing details."><select value={mode} disabled={busy || Boolean(report)} onChange={e => { setMode(e.target.value); setPreview(null); setError(""); }}><option value="skip">Skip existing contacts (recommended)</option><option value="update">Update non-empty names and notes</option></select></Field>
    <div className="contact-import-controls"><button className="button secondary" disabled={!rows.length || busy || reading || Boolean(report)} onClick={async () => {
      setBusy(true); setError("");
      try { setPreview(await api.previewContacts({ contacts: rows, duplicateMode: mode })); setShow("all"); }
      catch (err) { setError(err.message); }
      finally { setBusy(false); }
    }}>{busy && !preview ? <Spinner small /> : <Search size={16} />}Preview import</button></div>
    {preview && <>
      <div className="contact-import-summary" aria-label="Import summary">{[["create", "New"], ["restore", "Save again"], ["update", "Update"], ["skip", "Already saved"], ["duplicate", "Duplicates"], ["invalid", "Invalid"]].map(([key, label]) => <div className={key === "invalid" && preview.summary[key] ? "has-errors" : ""} key={key}><strong>{preview.summary[key]}</strong><span>{label}</span></div>)}</div>
      <div className="contact-preview-toolbar"><Field label="Preview rows"><select value={show} onChange={e => setShow(e.target.value)}><option value="all">All rows</option><option value="invalid">Invalid only</option><option value="skipped">Skipped / duplicates</option></select></Field><button className="text-link small-text" onClick={() => {
        const csv = csvText(["Record", "Name", "Phone", "Notes", "Action", "Reason"], preview.rows.map(r => [r.row, r.name, /^\d+$/.test(r.phone) ? `+${r.phone}` : r.phone, r.notes, ACTIONS[r.action], r.error || ""]));
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "contact-import-report.csv");
      }}><Download size={14} />Download row report</button></div>
      <div className="contact-preview-table"><table><thead><tr><th>Record</th><th>Name / phone</th><th>Result</th></tr></thead><tbody>{visible.slice(0, 100).map(r => <tr key={r.index} data-action={r.action}><td>{r.row}</td><td><strong>{r.name || "Unnamed contact"}</strong><span>{r.phone ? (/^\d+$/.test(r.phone) ? `+${r.phone}` : r.phone) : "No number"}</span>{r.existingName && r.existingName !== r.name && <small>Saved as: {r.existingName}</small>}</td><td><span className={`contact-import-badge ${r.action}`}>{ACTIONS[r.action]}</span>{r.error && <small>{r.error}</small>}</td></tr>)}</tbody></table>{!visible.length && <p className="muted small-text">No matching rows.</p>}</div>
      {visible.length > 100 && <p className="muted small-text">Showing 100 of {visible.length} rows. The downloaded report contains all rows.</p>}
      <p className="contact-policy"><AlertTriangle size={16} />Invalid, repeated and skipped rows are not imported. Adding contacts does not give permission to send unsolicited messages. No messages will be sent.</p>
      {!report && <div className="form-actions"><button className="button primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true); setError("");
        try { const r = await api.importContacts({ contacts: rows, duplicateMode: mode }); setReport(r); onChanged(); toast("Contacts import finished. No messages were sent."); }
        catch (err) { setError(err.message); }
        finally { setBusy(false); }
      }}>{busy ? <Spinner small /> : <Upload size={16} />}Import {ready} {ready === 1 ? "contact" : "contacts"}</button></div>}
    </>}
    {report && <div className="contact-import-result" role="status"><Check size={24} /><div><strong>Import finished</strong><p>{report.created} added · {report.restored} saved again · {report.updated} updated · {report.skipped} skipped · {report.duplicates} file duplicates · {report.invalid} invalid · {report.failed} failed</p><span>The final result uses current database values, so counts can differ from the preview if another user made changes.</span></div></div>}
    {report && <div className="form-actions"><button className="button primary" onClick={onBack}>View contacts</button><button className="button secondary" onClick={() => { setReport(null); setPreview(null); setRows([]); setFilename(""); setError(""); }}>Import another file</button></div>}
    {error && <div className="inline-error" role="alert">{error}</div>}
  </div>;
}

export default function ContactsManager({ api, onClose, onChanged, onChat, toast, revision = 0 }) {
  const [screen, setScreen] = useState("list"), [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [search, setSearch] = useState(""), [page, setPage] = useState(1), [version, setVersion] = useState(0);
  const [data, setData] = useState({ contacts: [], total: 0, allTotal: 0, hasMore: false }), [loading, setLoading] = useState(true), [error, setError] = useState(""), [selected, setSelected] = useState([]), [removing, setRemoving] = useState([]);
  useEffect(() => {
    let alive = true; setLoading(true); setError("");
    const timer = setTimeout(() => api.contactBook({ q: search, page, limit: 50 }).then(r => { if (alive) { if (!r.contacts.length && page > 1) setPage(1); else setData(r); } }).catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); }), 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [api, search, page, version, revision]);
  const changed = () => { setVersion(v => v + 1); setSelected([]); onChanged(); };
  const back = () => { setScreen("list"); setEditing(null); setError(""); };
  function toggle(phone) {
    setSelected(prev => prev.includes(phone) ? prev.filter(p => p !== phone) : prev.length >= 100 ? (toast("Select at most 100 contacts at once.", true), prev) : [...prev, phone]);
  }
  async function exportContacts(phones) {
    setBusy(true);
    try { downloadBlob(await api.exportContacts(phones ? { phones } : { q: search }), "omsai-contacts.csv"); toast("Contacts exported as UTF-8 CSV"); }
    catch (err) { toast(err.message, true); } finally { setBusy(false); }
  }
  const title = screen === "edit" ? editing ? "Edit contact" : "Add contact" : screen === "import" ? "Import contacts" : screen === "remove" ? "Remove contacts?" : "Contacts";
  return <Modal title={title} wide className="contacts-dialog" onClose={() => { if (!busy) onClose(); }}>
    {screen === "edit" ? <ContactEditor key={editing?.phone || "new"} contact={editing} api={api} busy={busy} setBusy={setBusy} onBack={back} onSaved={message => { if (!editing) { setSearch(""); setPage(1); } changed(); back(); toast(message); }} /> : screen === "import" ? <ContactsImport api={api} busy={busy} setBusy={setBusy} onBack={back} onChanged={() => { setSearch(""); setPage(1); changed(); }} toast={toast} /> : screen === "remove" ? <div className="contact-remove-confirm"><p>This removes <strong>{removing.length} {removing.length === 1 ? "contact" : "contacts"}</strong> from the shared address book and clears their saved names and notes for <strong>all workspace users</strong>.</p><p>Chat history and reply-window metadata remain. This does not block anyone, unsend messages, or delete contacts from their phones. A technical number record is retained for existing chats.</p>{error && <div className="inline-error" role="alert">{error}</div>}<div className="form-actions"><button className="button ghost" disabled={busy} onClick={back}>Cancel</button><button className="button destructive" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { const r = await api.removeContacts(removing); changed(); setPage(1); back(); toast(`${r.removed} contacts removed from the address book`); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }}>{busy ? <Spinner small /> : <Trash2 size={16} />}Remove from contacts</button></div></div> : <>
      <div className="contacts-heading"><span className="contacts-heading-icon"><UsersRound size={25} /></span><div><h3>Your people, in one place.</h3><p>{data.allTotal} saved contacts · Shared workspace address book</p></div></div>
      <div className="contacts-toolbar"><button className="button primary" disabled={busy} onClick={() => { setEditing(null); setScreen("edit"); }}><UserPlus size={16} />Add contact</button><button className="button secondary" disabled={busy} onClick={() => setScreen("import")}><Upload size={16} />Import contacts</button><button className="button secondary" disabled={busy} onClick={() => exportContacts()}>{busy ? <Spinner small /> : <Download size={16} />}Export contacts</button></div>
      <div className="search-field contacts-search"><Search size={17} /><input aria-label="Search contacts" placeholder="Search name, phone or note…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); setSelected([]); }} /></div>
      <p className="contacts-help">Importing never sends a message. Saved contacts appear here; they join the chat list when you open a conversation or receive a message.</p>
      {selected.length > 0 && <div className="contacts-selection"><strong>{selected.length} selected</strong><button disabled={busy} onClick={() => exportContacts(selected)}><Download size={15} />Export selected</button><button className="danger" disabled={busy} onClick={() => { setRemoving(selected); setScreen("remove"); }}><Trash2 size={15} />Remove selected</button></div>}
      {loading ? <div className="loading-line"><Spinner /></div> : error ? <div className="inline-error" role="alert">{error}<button className="text-link" onClick={() => setVersion(v => v + 1)}>Try again</button></div> : !data.contacts.length ? <EmptyState icon={UsersRound} title={search ? "No contacts found" : "Make room for your people"}>{search ? "Try another name, number or note." : "Add a contact, or import a CSV/VCF file to get started."}</EmptyState> : <>
        <div className="contacts-list-head"><label><input type="checkbox" aria-label="Select visible contacts" checked={data.contacts.length > 0 && data.contacts.every(c => selected.includes(c.phone))} onChange={e => {
          if (!e.target.checked) setSelected(prev => prev.filter(p => !data.contacts.some(c => c.phone === p)));
          else setSelected(prev => [...new Set([...prev, ...data.contacts.map(c => c.phone)])].slice(0, 100));
        }} />Select page</label><span>Name & number</span><span className="contacts-note-label">Workspace note</span><span>Actions</span></div>
        <div className="contacts-directory">{data.contacts.map(c => <div className="directory-contact" key={c.phone} data-phone={c.phone}>
          <input type="checkbox" aria-label={`Select contact ${c.name || formatPhone(c.phone)}`} checked={selected.includes(c.phone)} onChange={() => toggle(c.phone)} />
          <div className="directory-person"><Avatar name={c.name || c.phone} size={39} /><div><strong>{c.name || "Unnamed contact"}</strong><span>{formatPhone(c.phone)}</span></div></div>
          <p className="directory-note" title={c.notes}>{c.notes || "—"}</p>
          <div className="directory-actions"><IconButton label={`Open chat with ${c.name || formatPhone(c.phone)}`} disabled={busy} onClick={async () => {
            setBusy(true); try { await api.openContactChat(c.phone); const contact = await api.contact(c.phone); onChat(contact); } catch (err) { toast(err.message, true); } finally { setBusy(false); }
          }}><MessageCircle size={18} /></IconButton><IconButton label={`Edit contact ${c.name || formatPhone(c.phone)}`} disabled={busy} onClick={() => { setEditing(c); setScreen("edit"); }}><Pencil size={17} /></IconButton><IconButton label={`Remove contact ${c.name || formatPhone(c.phone)}`} disabled={busy} onClick={() => { setRemoving([c.phone]); setScreen("remove"); }}><Trash2 size={17} /></IconButton></div>
        </div>)}</div>
        <div className="contacts-pagination"><span>{(page - 1) * 50 + 1}–{(page - 1) * 50 + data.contacts.length} of {data.total}</span><button className="button secondary small" aria-label="Previous contacts page" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} />Previous</button><button className="button secondary small" aria-label="Next contacts page" disabled={!data.hasMore || busy} onClick={() => setPage(p => p + 1)}>Next<ChevronRight size={16} /></button></div>
      </>}
      <p className="panel-footnote">Names and notes are shared with authorized users. Contact removal does not erase chat history. Cloud API messaging rules still apply.</p>
    </>}
  </Modal>;
}
