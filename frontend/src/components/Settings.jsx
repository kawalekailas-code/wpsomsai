import React, { useState } from "react";
import { ArrowLeft, UserRound, Palette, Bell, MessageSquareText, HardDrive, ShieldCheck, Download, LogOut, RotateCcw, Sun, Moon, Monitor, Check, KeyRound, ExternalLink } from "lucide-react";
import { Avatar, Field, IconButton, Spinner, Switch } from "./ui.jsx";

export default function Settings({ user, config, api, onClose, onUpdate, onLogout, toast, onInstall, onReset }) {
  const [name, setName] = useState(user.displayName || user.username), [about, setAbout] = useState(user.about || "Available");
  const [quick, setQuick] = useState((user.preferences?.quickReplies || []).join("\n"));
  const [oldPassword, setOld] = useState(""), [newPassword, setNew] = useState("");
  const [busy, setBusy] = useState("");
  const p = user.preferences || {};
  async function save(data, key) {
    setBusy(key);
    try { await onUpdate(data); toast("Settings saved"); }
    catch (err) { toast(err.message, true); }
    finally { setBusy(""); }
  }
  async function notification(enabled) {
    if (enabled) {
      if (!("Notification" in window)) return toast("This browser does not support desktop notifications.", true);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return toast("Allow notifications in your browser's site settings first.", true);
    }
    save({ preferences: { desktopNotifications: enabled } }, "notifications");
  }
  return <aside className="side-panel settings-panel" aria-label="Settings">
    <header className="panel-header"><IconButton label="Back from settings" onClick={onClose}><ArrowLeft size={21} /></IconButton><h2>Settings</h2></header>
    <div className="panel-scroll">
      <div className="settings-profile"><Avatar name={name || "You"} size={76} /><div><h3>{user.displayName || user.username}</h3><span>{api.demo ? "Demo profile" : `@${user.username}`}</span></div></div>
      <section className="settings-section"><h3><UserRound size={17} />Your profile</h3>
        <form onSubmit={e => { e.preventDefault(); save({ displayName: name, about }, "profile"); }}>
          <Field label="Display name" hint="Visible inside this app; it does not change your WhatsApp business profile."><input value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></Field>
          <Field label="About"><input value={about} onChange={e => setAbout(e.target.value)} maxLength={140} /></Field>
          <button className="button secondary small" disabled={busy === "profile"}>{busy === "profile" ? <Spinner small /> : <Check size={15} />}Save profile</button>
        </form>
      </section>
      <section className="settings-section"><h3><Palette size={17} />Make it yours</h3><label className="setting-label">Theme</label>
        <div className="theme-options">{[["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]].map(([value, Icon, label]) => <button key={value} className={p.theme === value ? "selected" : ""} onClick={() => save({ preferences: { theme: value } }, "theme")}><Icon size={19} />{label}</button>)}</div>
        <label className="setting-label">Chat wallpaper</label><div className="wallpaper-options">{["doodle", "sage", "sand", "plain"].map(value => <button key={value} aria-label={`${value} wallpaper`} title={value} className={`wallpaper-swatch ${value} ${p.wallpaper === value ? "selected" : ""}`} onClick={() => save({ preferences: { wallpaper: value } }, "wallpaper")}>{p.wallpaper === value && <Check size={19} />}</button>)}</div>
        <Field label="Message size"><select value={p.fontSize || "medium"} onChange={e => save({ preferences: { fontSize: e.target.value } }, "font")}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></Field>
      </section>
      <section className="settings-section"><h3><Bell size={17} />Notifications & typing</h3>
        <div className="setting-row"><span>Message sounds<small>Muted chats stay quiet.</small></span><Switch label="Message sounds" checked={p.sound !== false} onChange={value => save({ preferences: { sound: value } }, "sound")} /></div>
        <div className="setting-row"><span>Desktop notifications<small>Shows “New message”, not message contents.</small></span><Switch label="Desktop notifications" checked={p.desktopNotifications || false} onChange={notification} /></div>
        <div className="setting-row"><span>Enter to send<small>Use Shift + Enter for a new line.</small></span><Switch label="Enter to send" checked={p.enterToSend !== false} onChange={value => save({ preferences: { enterToSend: value } }, "enter")} /></div>
      </section>
      <section className="settings-section"><h3><MessageSquareText size={17} />Quick replies</h3><p className="muted small-text">One per line. Selecting a reply inserts a draft—it never sends automatically.</p>
        <form onSubmit={e => { e.preventDefault(); save({ preferences: { quickReplies: quick.split("\n").map(s => s.trim()).filter(Boolean) } }, "quick"); }}><Field label="Your saved replies"><textarea rows={4} value={quick} onChange={e => setQuick(e.target.value)} maxLength={6000} /></Field><button className="button secondary small" disabled={busy === "quick"}>Save quick replies</button></form>
      </section>
      <section className="settings-section"><h3><HardDrive size={17} />Storage & retention</h3>
        <div className="retention-pill">{config?.retentionDays || 30}<span>days of message history</span></div>
        <p className="muted small-text">Messages, including starred ones, are automatically removed after 30 days. Incoming Meta attachments may expire after 7 days; uploaded attachments after 30 days. Download important files sooner.</p>
        <p className="muted small-text">Attachments use Meta media IDs—not MongoDB binary storage or Render's temporary disk. Deleting for yourself hides a message; it does not immediately reduce database usage.</p>
      </section>
      <section className="settings-section"><h3><ShieldCheck size={17} />What stays local</h3>
        <p className="muted small-text">Pin, archive, mute, stars and “delete for me” apply only to your account in this app. Contact names and notes are shared with other authorized workspace users. None sync to a personal WhatsApp account.</p>
        <p className="muted small-text">This is an official Cloud API workspace, not a replacement client for a personal number. It does not import personal chat history, groups, Status stories, calls, online presence or QR sessions. Meta's 24-hour reply window still applies.</p>
        <a className="text-link small-text" href="https://business.whatsapp.com/policy" target="_blank" rel="noopener noreferrer">WhatsApp messaging policy<ExternalLink size={13} /></a>
      </section>
      {!api.demo && <section className="settings-section"><h3><KeyRound size={17} />Account security</h3><form onSubmit={async e => { e.preventDefault(); setBusy("password"); try { await api.changePassword({ oldPassword, newPassword }); setOld(""); setNew(""); toast("Password changed. Please sign in again."); } catch (err) { toast(err.message, true); } finally { setBusy(""); } }}><Field label="Current password"><input type="password" value={oldPassword} onChange={e => setOld(e.target.value)} autoComplete="current-password" required /></Field><Field label="New password"><input type="password" value={newPassword} onChange={e => setNew(e.target.value)} minLength={10} maxLength={200} autoComplete="new-password" required /></Field><button className="button secondary small" disabled={busy === "password"}>Change password</button></form></section>}
      <section className="settings-section account-actions"><button onClick={onInstall}><Download size={18} />Install app</button>{api.demo && <button onClick={onReset}><RotateCcw size={18} />Reset demo</button>}<button className="danger" onClick={onLogout}><LogOut size={18} />{api.demo ? "Leave demo / connect your API" : "Sign out"}</button></section>
      <p className="settings-footnote">OmSai Chat · personal-style workspace<br />No Broadcast, Pipeline or Marketing modules.</p>
    </div>
  </aside>;
}
