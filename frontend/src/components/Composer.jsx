import React, { useEffect, useRef, useState } from "react";
import { Smile, Plus, Send, Mic, X, Image, FileText, Camera, Headphones, Sticker, MapPin, UserRound, Zap, Square, Trash2, CornerUpLeft, Paperclip } from "lucide-react";
import { Field, IconButton, Menu, Modal, Spinner } from "./ui.jsx";
import { EMOJI, messagePreview } from "../lib/chat.js";

export default function Composer({ contact, user, reply, onCancelReply, onSendText, onSendMedia, onLocation, onContact, toast, disabled, windowOpen = true }) {
  const draftKey = `omsai-draft-${user._id}-${contact.phone}`;
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) || ""; } catch { return ""; } });
  const [panel, setPanel] = useState(null), [sending, setSending] = useState(false), [attachment, setAttachment] = useState(null), [previewURL, setPreviewURL] = useState(""), [caption, setCaption] = useState("");
  const [recording, setRecording] = useState(false), [seconds, setSeconds] = useState(0), [requestingMic, setRequestingMic] = useState(false);
  const inputRef = useRef(null), fileRef = useRef(null), cameraRef = useRef(null), pendingKind = useRef(""), recorderRef = useRef(null), streamRef = useRef(null), recordAction = useRef("cancel"), mounted = useRef(true);
  const blocked = disabled || !windowOpen;
  useEffect(() => {
    try { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); } catch { /* Storage may be disabled. */ }
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = `${Math.min(140, inputRef.current.scrollHeight)}px`; }
  }, [text, draftKey]);
  useEffect(() => { if (reply) inputRef.current?.focus(); }, [reply]);
  useEffect(() => {
    if (!attachment) { setPreviewURL(""); return; }
    const url = URL.createObjectURL(attachment.file); setPreviewURL(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => { if (recording && seconds >= 120) stopRecording("review"); }, [seconds, recording]);
  useEffect(() => {
    // React StrictMode runs setup/cleanup/setup during development.
    mounted.current = true;
    return () => {
      mounted.current = false; recordAction.current = "cancel";
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  async function sendText() {
    if (blocked || sending || !text.trim()) return;
    setSending(true); setPanel(null);
    try { await onSendText({ message: text.trim(), replyToId: reply?._id }); setText(""); onCancelReply(); inputRef.current?.focus(); }
    catch (err) { toast(err.message, true); }
    finally { setSending(false); }
  }
  function chooseFile(kind, accept) { pendingKind.current = kind; fileRef.current.accept = accept; fileRef.current.click(); }
  function picked(file, kind) {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) return toast("The app's attachment limit is 16 MB.", true);
    if (kind === "sticker" && (file.size > 100 * 1024 || file.type !== "image/webp")) return toast("Use a static WebP sticker under 100 KB.", true);
    setAttachment({ file, kind }); setCaption(""); setPanel(null);
  }
  async function startRecording() {
    if (blocked || recording || requestingMic) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Voice recording needs HTTPS and a supported browser. You can attach an audio file instead.", true);
    setRequestingMic(true); setPanel(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder; const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        if (recordAction.current === "review" && chunks.length) {
          const mime = recorder.mimeType || "audio/webm";
          const extension = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
          picked(new File(chunks, `voice-note.${extension}`, { type: mime }), "voice");
        }
      };
      recorder.onerror = () => { stream.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecording(false); toast("Recording failed. Please try again.", true); } };
      setSeconds(0); recordAction.current = "review"; recorder.start(); setRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (mounted.current) toast("Microphone permission was denied or the microphone is unavailable.", true);
    }
    finally { if (mounted.current) setRequestingMic(false); }
  }
  function stopRecording(action) { recordAction.current = action; if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }
  const items = [
    { label: "Photos & videos", icon: Image, action: () => chooseFile("media", "image/jpeg,image/png,video/mp4,video/3gpp") },
    { label: "Document", icon: FileText, action: () => chooseFile("document", ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt") },
    { label: "Take a photo", icon: Camera, action: () => cameraRef.current.click() },
    { label: "Audio", icon: Headphones, action: () => chooseFile("audio", "audio/mpeg,audio/mp4,audio/aac,audio/amr,audio/ogg") },
    { label: "WebP sticker", icon: Sticker, action: () => chooseFile("sticker", "image/webp") },
    { separator: true },
    { label: "Location", icon: MapPin, action: onLocation },
    { label: "Contact", icon: UserRound, action: onContact }
  ];
  return <div className={`composer-wrap ${recording ? "recording" : ""}`}>
    {reply && <div className="reply-draft"><CornerUpLeft size={21} /><div><strong>Replying to {reply.direction === "outgoing" ? "yourself" : contact.name || "contact"}</strong><span>{messagePreview(reply)}</span></div><IconButton label="Cancel reply" onClick={onCancelReply}><X size={18} /></IconButton></div>}
    {(panel === "emoji" || panel === "quick") && <><button className="composer-scrim" aria-label="Close composer panel" onClick={() => setPanel(null)} /><div className={`composer-popup ${panel === "quick" ? "quick-reply-popup" : "emoji-popup"}`}>
      <header><span>{panel === "emoji" ? "A little expression" : "Your quick replies"}</span><IconButton label="Close composer panel" onClick={() => setPanel(null)}><X size={17} /></IconButton></header>
      {panel === "emoji" ? <div className="emoji-grid">{EMOJI.map(emoji => <button key={emoji} aria-label={`Insert ${emoji}`} onClick={() => { setText(t => t + emoji); inputRef.current?.focus(); }}>{emoji}</button>)}</div> : <div className="quick-reply-list">{(user.preferences?.quickReplies || []).map((q, i) => <button key={i} onClick={() => { setText(t => t ? `${t} ${q}` : q); setPanel(null); inputRef.current?.focus(); }}>{q}<CornerUpLeft size={14} /></button>)}{!user.preferences?.quickReplies?.length && <p>Add quick replies in Settings.</p>}</div>}
    </div></>}
    {recording ? <div className="recording-bar"><IconButton label="Cancel voice recording" onClick={() => stopRecording("cancel")}><Trash2 size={21} /></IconButton><span className="record-dot" /><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong><div className="recording-waves" aria-hidden="true">{Array.from({ length: 27 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.07}s`, height: `${8 + (i * 7 % 20)}px` }} />)}</div><small>2 min max</small><IconButton label="Stop and review voice note" className="record-stop" onClick={() => stopRecording("review")}><Square size={18} fill="currentColor" /></IconButton></div> : <div className="composer">
      <div className="attachment-anchor"><IconButton label="Attach" disabled={blocked || sending} className={panel === "attach" ? "active" : ""} onClick={() => setPanel(panel === "attach" ? null : "attach")}><Plus size={25} /></IconButton>{panel === "attach" && <Menu items={items} onClose={() => setPanel(null)} className="attachment-menu" />}</div>
      <div className="composer-input-shell"><IconButton label="Emoji" className={panel === "emoji" ? "active" : ""} onClick={() => setPanel(panel === "emoji" ? null : "emoji")}><Smile size={23} /></IconButton><textarea ref={inputRef} rows={1} aria-label="Type a message" placeholder={windowOpen ? "Type a message" : "Write a draft…"} value={text} maxLength={4096} onChange={e => setText(e.target.value)} onKeyDown={e => {
        if (e.key === "Escape" && reply) onCancelReply();
        if (e.key === "Enter" && !e.nativeEvent.isComposing && ((user.preferences?.enterToSend !== false && !e.shiftKey) || e.ctrlKey || e.metaKey)) { e.preventDefault(); sendText(); }
      }} /><IconButton label="Quick replies" className={panel === "quick" ? "active" : ""} onClick={() => setPanel(panel === "quick" ? null : "quick")}><Zap size={19} /></IconButton></div>
      {text.trim() ? <IconButton label="Send message" className="send-button" onClick={sendText} disabled={blocked || sending}>{sending ? <Spinner small /> : <Send size={21} />}</IconButton> : <IconButton label="Record voice message" className="mic-button" disabled={blocked || sending || requestingMic} onClick={startRecording}>{requestingMic ? <Spinner small /> : <Mic size={23} />}</IconButton>}
    </div>}
    <input type="file" ref={fileRef} className="visually-hidden" onChange={e => { picked(e.target.files?.[0], pendingKind.current); e.target.value = ""; }} />
    <input type="file" ref={cameraRef} className="visually-hidden" accept="image/jpeg,image/png" capture="environment" onChange={e => { picked(e.target.files?.[0], "media"); e.target.value = ""; }} />
    {attachment && <Modal title={attachment.kind === "voice" ? "Review voice note" : "Send attachment"} onClose={() => { if (!sending) setAttachment(null); }} className="attachment-dialog">
      {attachment.file.type.startsWith("image/") ? <img className="attachment-preview" src={previewURL} alt="Attachment preview" /> : attachment.file.type.startsWith("video/") ? <video className="attachment-preview" controls src={previewURL} /> : attachment.file.type.startsWith("audio/") ? <audio className="attachment-audio" controls src={previewURL} /> : <div className="file-preview"><Paperclip size={35} /><strong>{attachment.file.name}</strong><small>{(attachment.file.size / 1024).toFixed(1)} KB</small></div>}
      {attachment.kind === "voice" && <p className="muted small-text">Converted to mono OGG/Opus on the server before sending. Up to 2 minutes.</p>}
      {!["voice", "audio", "sticker"].includes(attachment.kind) && <Field label="Caption (optional)"><input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption…" maxLength={1024} /></Field>}
      <div className="form-actions"><button className="button ghost" disabled={sending} onClick={() => setAttachment(null)}>Cancel</button><button className="button primary" disabled={sending || blocked} onClick={async () => { setSending(true); try { await onSendMedia({ file: attachment.file, caption, voice: attachment.kind === "voice", kind: attachment.kind === "sticker" ? "sticker" : undefined, replyToId: reply?._id }); setAttachment(null); onCancelReply(); } catch (err) { toast(err.message, true); } finally { setSending(false); } }}>{sending ? <Spinner small /> : <Send size={17} />}Send</button></div>
    </Modal>}
  </div>;
}
