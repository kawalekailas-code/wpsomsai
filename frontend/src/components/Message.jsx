import React, { useEffect, useState } from "react";
import { Check, CheckCheck, Clock3, ChevronDown, Smile, Reply, Forward, Star, Copy, Info, Trash2, Download, FileText, MapPin, ExternalLink, UserRound, AlertCircle, Mic, Plus } from "lucide-react";
import { IconButton, Menu, Avatar, Spinner } from "./ui.jsx";
import { formatPhone, formatTime, messagePreview, REACTIONS, EMOJI } from "../lib/chat.js";

export function StatusIcon({ status, size = 15 }) {
  if (status === "pending") return <Clock3 size={size - 2} aria-label="Pending" />;
  if (status === "failed") return <AlertCircle size={size} className="failed-icon" aria-label="Failed" />;
  if (["seen", "played", "delivered"].includes(status)) return <CheckCheck size={size} className={["seen", "played"].includes(status) ? "read-icon" : ""} aria-label={status === "seen" ? "Read" : status} />;
  return <Check size={size} aria-label="Sent" />;
}

export function RichText({ text = "" }) {
  // React escapes every token. No HTML injection or third-party link previews.
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s<>]+)/g);
  return <span className="rich-text">{parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    if (part.startsWith("```")) return <code className="code-block" key={i}>{part.slice(3, -3)}</code>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~") && part.endsWith("~")) return <s key={i}>{part.slice(1, -1)}</s>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  })}</span>;
}

export function usePrivateMedia(message, api, needed = true) {
  const [state, setState] = useState({ url: message?.demoUrl || "", error: "", loading: false });
  useEffect(() => {
    if (!message?.media || !needed) return;
    if (message.demoUrl) { setState({ url: message.demoUrl, error: "", loading: false }); return; }
    let active = true, url;
    setState({ url: "", error: "", loading: true });
    api.media(message._id).then(blob => {
      url = URL.createObjectURL(blob);
      if (active) setState({ url, error: "", loading: false }); else URL.revokeObjectURL(url);
    }).catch(err => { if (active) setState({ url: "", error: err.message, loading: false }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [message?._id, message?.demoUrl, api, needed]);
  return state;
}

export function MapPreview({ location }) {
  return <svg viewBox="0 0 300 130" className="map-preview" role="img" aria-label="Illustrative map, not a live map">
    <rect width="300" height="130" fill="#e9eee2" /><path d="M0 75 Q70 35 128 83 T300 63" fill="none" stroke="#b7d8e0" strokeWidth="23" />
    <path d="M0 26L300 104M45 0L124 130M215 0L164 130M0 110L300 9" stroke="#fff" strokeWidth="10" fill="none" /><path d="M0 26L300 104M45 0L124 130M215 0L164 130M0 110L300 9" stroke="#d8d8cc" strokeWidth="1" fill="none" />
    <rect x="13" y="29" width="30" height="25" rx="5" fill="#c6d9bd" /><rect x="229" y="87" width="40" height="30" rx="5" fill="#c6d9bd" />
    <circle cx="150" cy="65" r="24" fill="#075e54" opacity=".1" /><path d="M150 80s14-14 14-23a14 14 0 0 0-28 0c0 9 14 23 14 23" fill="#07876e" /><circle cx="150" cy="57" r="5" fill="white" />
  </svg>;
}
function MediaBody({ message, api, onAction, onImage }) {
  const kind = message.type === "text" ? (message.mimeType?.split("/")[0] || "document") : message.type;
  const inline = ["image", "sticker", "audio", "video"].includes(kind);
  const media = usePrivateMedia(message, api, inline);
  if (!inline) return <button className="document-card" onClick={() => onAction("download", message)}><span className="document-icon"><FileText size={25} /></span><span><strong>{message.filename || message.message || "Document"}</strong><small>{(message.mimeType?.split("/")[1] || "FILE").slice(0, 25).toUpperCase()} · Download</small></span><Download size={19} /></button>;
  if (media.loading) return <div className="media-placeholder"><Spinner /><span>Loading attachment…</span></div>;
  if (media.error) return <div className="attachment-error"><AlertCircle size={20} /><span>{media.error}</span></div>;
  if (kind === "image" || kind === "sticker") return <button className={`image-message ${kind === "sticker" ? "sticker" : ""}`} onClick={() => onImage({ message, url: media.url })} aria-label="Open photo"><img src={media.url} alt={message.caption || (kind === "sticker" ? "Sticker" : "Shared photo")} loading="lazy" /></button>;
  if (kind === "video") return <video className="video-message" controls preload="metadata" src={media.url} aria-label={message.filename || "Shared video"} />;
  return <div className="audio-message"><span className="audio-icon"><Mic size={23} /></span><div><small>{message.voice ? "Voice message" : "Audio attachment"}</small><audio controls preload="metadata" src={media.url} aria-label={message.voice ? "Voice message" : "Audio message"} /></div></div>;
}
export default function MessageBubble({ message: m, contactName, api, onAction, onReact, onImage, onJump, highlighted }) {
  const [menu, setMenu] = useState(false), [reacting, setReacting] = useState(false), [moreEmoji, setMoreEmoji] = useState(false);
  const out = m.direction === "outgoing";
  const canNative = Boolean(m.waMessageId && !["failed", "pending"].includes(m.status));
  const name = out ? "You" : contactName;
  const items = [
    { label: "Reply", icon: Reply, disabled: !canNative, action: () => onAction("reply", m) },
    { label: "React", icon: Smile, disabled: !canNative, action: () => setReacting(true) },
    { label: "Forward", icon: Forward, disabled: m.type === "unsupported", action: () => onAction("forward", m) },
    { label: m.starred ? "Unstar message" : "Star message", icon: Star, action: () => onAction("star", m) },
    !m.media && { label: "Copy", icon: Copy, action: () => onAction("copy", m) },
    m.media && { label: "Download", icon: Download, action: () => onAction("download", m) },
    { label: "Message info", icon: Info, action: () => onAction("info", m) },
    { separator: true },
    { label: "Delete for me", icon: Trash2, danger: true, action: () => onAction("delete", m) }
  ];
  const emojis = [m.reactions?.self, m.reactions?.contact].filter(Boolean);
  return <div className={`message-row ${out ? "outgoing" : "incoming"} ${highlighted ? "highlighted" : ""} ${menu || reacting ? "elevated" : ""}`} id={`message-${m._id}`}>
    <div className={`message-bubble ${m.media ? "has-media" : ""} ${m.type === "sticker" ? "sticker-bubble" : ""}`}>
      {m.forwarded && <span className="forwarded-label"><Forward size={12} />Forwarded in this app</span>}
      {m.context && <button className="quoted-message" onClick={() => m.context.messageId && onJump(m.context.messageId)}><strong>{m.context.direction === "outgoing" ? "You" : contactName}</strong><span>{m.context.message || "Earlier message"}</span></button>}
      {m.media ? <MediaBody message={m} api={api} onAction={onAction} onImage={onImage} /> : m.type === "location" ? <a className="location-card" href={`https://www.openstreetmap.org/?mlat=${Number(m.location?.latitude)}&mlon=${Number(m.location?.longitude)}#map=17/${Number(m.location?.latitude)}/${Number(m.location?.longitude)}`} target="_blank" rel="noopener noreferrer"><MapPreview location={m.location} /><div><MapPin size={18} /><span><strong>{m.location?.name || "Shared location"}</strong><small>{m.location?.address || `${m.location?.latitude}, ${m.location?.longitude}`}</small></span><ExternalLink size={14} /></div></a> : m.type === "contacts" ? <div className="contact-card">{(m.contacts || []).map((c, i) => <div key={i}><Avatar name={c.name} size={38} /><span><strong>{c.name}</strong><small>{formatPhone(c.phone)}</small></span></div>)}<button onClick={() => onAction("save-contact", m)}><UserRound size={15} />Save contact</button></div> : <div className="message-text">{m.type === "template" && <span className="template-label">Approved template</span>}<RichText text={m.message} /></div>}
      {m.media && m.caption && <div className="media-caption"><RichText text={m.caption} /></div>}
      <div className="message-meta">{m.starred && <Star size={11} fill="currentColor" aria-label="Starred" />}<span>{formatTime(m.createdAt)}</span>{out && <StatusIcon status={m.status} />}</div>
      <div className="message-tools"><IconButton label={`React to message from ${name}`} onClick={() => { setReacting(v => !v); setMenu(false); }} disabled={!canNative}><Smile size={18} /></IconButton><IconButton label={`Message options: ${messagePreview(m).slice(0, 30)}`} onClick={() => { setMenu(v => !v); setReacting(false); }}><ChevronDown size={18} /></IconButton></div>
      {menu && <Menu items={items} onClose={() => setMenu(false)} className="message-menu" />}
      {reacting && <><button className="popover-scrim" aria-label="Close reactions" onClick={() => { setReacting(false); setMoreEmoji(false); }} /><div className={`reaction-picker ${moreEmoji ? "expanded" : ""}`}>
        {(moreEmoji ? EMOJI : REACTIONS).map(emoji => <button key={emoji} className={m.reactions?.self === emoji ? "selected" : ""} onClick={() => { onReact(m, m.reactions?.self === emoji ? "" : emoji); setReacting(false); setMoreEmoji(false); }} aria-label={`React ${emoji}`}>{emoji}</button>)}{!moreEmoji && <IconButton label="More reaction emoji" onClick={() => setMoreEmoji(true)}><Plus size={18} /></IconButton>}
      </div></>}
      {emojis.length > 0 && <button className={`reaction-pill ${m.reactions?.self ? "mine" : ""}`} title="Click to change or remove your reaction" onClick={() => setReacting(v => !v)}>{[...new Set(emojis)].join(" ")}{emojis.length > 1 && <small>{emojis.length}</small>}</button>}
    </div>
    {m.status === "failed" && out && <div className="send-error"><AlertCircle size={13} />{m.error || "Message was not sent. Try again from the composer."}</div>}
  </div>;
}
