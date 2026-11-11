import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { MessageCircle, MessageSquarePlus, Star, Archive, Settings as SettingsIcon, Search, MoreVertical, X, Pin, BellOff, Mail, MailOpen, ArrowLeft, ChevronDown, ChevronRight, ArrowDown, Info, WifiOff, Check, Trash2, Download, ShieldCheck, Send, ExternalLink, Leaf, Image as ImageIcon, Plus, RefreshCw, PanelRightClose, UsersRound, Gauge } from "lucide-react";
import { mergeCatchUp } from "./lib/sender.js";
import { makeService, clearSession, getToken } from "./lib/api.js";
import { connectSocket } from "./socket.js";
import { dayLabel, downloadBlob, formatPhone, isMuted, messagePreview, playNotification, replyWindow, sidebarTime, upsertMessage } from "./lib/chat.js";
import { Avatar, EmptyState, IconButton, Menu, Spinner, Toast } from "./components/ui.jsx";
import MessageBubble, { StatusIcon } from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import Login from "./components/Login.jsx";
import Settings from "./components/Settings.jsx";
const TemplateSender = lazy(() => import("./components/TemplateSender.jsx"));
const SystemUsage = lazy(() => import("./components/SystemUsage.jsx"));
const IncomingSafety = lazy(() => import("./components/IncomingSafety.jsx"));
const ContactsManager = lazy(() => import("./components/ContactsManager.jsx"));
import { ContactPanel, GalleryPanel, MessageListPanel } from "./components/Panels.jsx";
import { ContactDialog, ConfirmDialog, ForwardDialog, ImageViewer, LocationDialog, MessageInfo, ShareContactDialog, TemplateDialog } from "./components/Dialogs.jsx";

function initialMode() {
  try { const saved = localStorage.getItem("omsai_mode"); if (saved) return saved; } catch { /* No storage */ }
  return import.meta.env.VITE_DEMO_MODE === "true" ? "demo" : "real";
}
function useDebounced(value, delay = 220) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setResult(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return result;
}

function Welcome({ onNewChat, onSearch }) {
  return <div className="welcome-screen"><div className="welcome-art" aria-hidden="true"><div className="welcome-ring ring-one" /><div className="welcome-ring ring-two" /><span className="welcome-leaf leaf-one"><Leaf size={34} /></span><span className="welcome-leaf leaf-two"><Leaf size={24} /></span><div className="welcome-bubble"><MessageCircle size={60} strokeWidth={1.4} /><span><Check size={13} /><Check size={13} /></span></div><span className="welcome-spark">✳</span></div><span className="eyebrow">A LITTLE SPACE TO CONNECT</span><h1>Your people.<br /><em>Your conversations.</em></h1><p>Choose a chat and pick up where you left off.<br />The familiar things, without the extra noise.</p><button className="button primary" onClick={onNewChat}><MessageSquarePlus size={18} />Start a conversation</button><button className="welcome-search" onClick={onSearch}>Or find a message <kbd>Ctrl K</kbd></button><div className="welcome-api-note"><ShieldCheck size={16} /><span>Personal-style workspace · Official Cloud API</span></div></div>;
}

export default function App() {
  const [mode, setMode] = useState(initialMode);
  const api = useMemo(() => makeService(mode === "demo"), [mode]);
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [config, setConfig] = useState(null);
  const [contacts, setContacts] = useState([]), [contactsLoading, setContactsLoading] = useState(false), [contactError, setContactError] = useState(""), [hasMore, setHasMore] = useState(false), [page, setPage] = useState(1);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all");
  const debouncedSearch = useDebounced(search);
  const [active, setActive] = useState(null), [messages, setMessages] = useState([]), [messagesLoading, setMessagesLoading] = useState(false), [messageError, setMessageError] = useState(""), [cursor, setCursor] = useState(null), [loadingOlder, setLoadingOlder] = useState(false), [around, setAround] = useState(false);
  const [reply, setReply] = useState(null), [panel, setPanel] = useState(null), [dialog, setDialog] = useState(null), [image, setImage] = useState(null), [revision, setRevision] = useState(0);
  const [sidebarMenu, setSidebarMenu] = useState(false), [chatMenu, setChatMenu] = useState(false), [rowMenu, setRowMenu] = useState(null);
  const [notice, setNotice] = useState(null), [connected, setConnected] = useState(false), [online, setOnline] = useState(navigator.onLine), [tick, setTick] = useState(Date.now());
  const [syncStatus, setSyncStatus] = useState("");
  const syncCursorRef = useRef(null), syncBusyRef = useRef(null);
  const [showDown, setShowDown] = useState(false), [newCount, setNewCount] = useState(0), [highlight, setHighlight] = useState(null);
  const activeRef = useRef(null), contactsRef = useRef([]), userRef = useRef(null), aroundRef = useRef(false);
  const refreshRef = useRef(() => {}), searchRef = useRef(null), scrollRef = useRef(null), contentRef = useRef(null), atBottom = useRef(true), shouldScroll = useRef(false);
  const sessionEpoch = useRef(0), messageRequest = useRef(0), contactRequest = useRef(0), demoOpened = useRef(false), installPrompt = useRef(null), toastTimer = useRef(null);
  activeRef.current = active; contactsRef.current = contacts; userRef.current = user; aroundRef.current = around;

  const toast = useCallback((text, error = false) => { clearTimeout(toastTimer.current); setNotice({ text, error }); toastTimer.current = setTimeout(() => setNotice(null), error ? 7500 : 3500); }, []);
  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" }); });
    atBottom.current = true; setShowDown(false); setNewCount(0);
  }, []);
  const clearWorkspace = useCallback(() => {
    sessionEpoch.current++; messageRequest.current++; contactRequest.current++; syncCursorRef.current = null; setSyncStatus("");
    activeRef.current = null; userRef.current = null; contactsRef.current = []; aroundRef.current = false;
    setUser(null); setConfig(null); setActive(null); setContacts([]); setMessages([]);
    setPanel(null); setDialog(null); setImage(null); setReply(null); setCursor(null); setAround(false);
    setSidebarMenu(false); setChatMenu(false); setRowMenu(null); setConnected(false);
    setContactsLoading(false); setMessagesLoading(false); setLoadingOlder(false); setHasMore(false);
    setMessageError(""); setContactError(""); setNewCount(0); setShowDown(false); setHighlight(null);
    setSearch(""); setFilter("all"); setPage(1); demoOpened.current = false;
  }, []);
  const catchUp = useCallback(async () => {
    const contact = activeRef.current, checkpoint = syncCursorRef.current;
    if (!contact || !checkpoint || checkpoint.phone !== contact.phone || !api.syncMessages) return;
    const session = sessionEpoch.current, request = messageRequest.current;
    const tag = `${session}:${request}:${contact.phone}`;
    if (syncBusyRef.current === tag) return;
    syncBusyRef.current = tag; setSyncStatus("Syncing stored messages…");
    let complete = false, through;
    try {
      for (let page = 0; page < 50; page++) {
        const update = await api.syncMessages(contact.phone, syncCursorRef.current.cursor);
        if (session !== sessionEpoch.current || request !== messageRequest.current || activeRef.current?.phone !== contact.phone) return;
        if (atBottom.current && !aroundRef.current) shouldScroll.current = true;
        setMessages(prev => mergeCatchUp(prev, update, { around: aroundRef.current }));
        if (aroundRef.current && update.messages.length) setShowDown(true);
        syncCursorRef.current = { phone: contact.phone, cursor: update.syncCursor };
        through = update.readThrough;
        if (!update.hasMore) { complete = true; break; }
      }
      if (complete && !document.hidden && !aroundRef.current && atBottom.current) await api.readChat(contact.phone, through);
      if (session === sessionEpoch.current && request === messageRequest.current) setSyncStatus(complete ? "" : "More stored updates remain. Use Sync stored messages to continue, or reopen this chat to jump to latest.");
    } catch (err) { if (session === sessionEpoch.current && request === messageRequest.current) setSyncStatus(`Catch-up incomplete: ${err.message}`); }
    finally { if (syncBusyRef.current === tag) syncBusyRef.current = null; }
  }, [api]);
  const openChat = useCallback(async (input, jumpId) => {
    const request = ++messageRequest.current, session = sessionEpoch.current;
    try {
      const contact = typeof input === "string" ? await api.contact(input) : input;
      if (request !== messageRequest.current || session !== sessionEpoch.current) return;
      syncCursorRef.current = null; setSyncStatus("");
      activeRef.current = contact; setActive(contact); setReply(null); setChatMenu(false); setRowMenu(null); setMessages([]); setCursor(null); setLoadingOlder(false); setMessagesLoading(true); setMessageError(""); setAround(Boolean(jumpId)); setNewCount(0); setShowDown(false);
      const result = await api.messages(contact.phone, undefined, jumpId);
      if (request !== messageRequest.current) return;
      syncCursorRef.current = { phone: contact.phone, cursor: result.syncCursor };
      setMessages(result.messages); setCursor(result.nextCursor); shouldScroll.current = !jumpId;
      if (jumpId) {
        setHighlight(jumpId);
        setTimeout(() => document.getElementById(`message-${jumpId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
        setTimeout(() => setHighlight(null), 2400);
      }
      if (!document.hidden && !jumpId) api.readChat(contact.phone, result.readThrough).then(result => {
        if (session !== sessionEpoch.current) return;
        setActive(prev => prev?.phone === contact.phone ? { ...prev, hasUnread: false } : prev);
        setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, hasUnread: false } : c));
        if (result.warning) toast(result.warning, true);
      }).catch(err => { if (session === sessionEpoch.current) toast(err.message, true); });
    } catch (err) { if (request === messageRequest.current) setMessageError(err.message); }
    finally { if (request === messageRequest.current) setMessagesLoading(false); }
  }, [api, toast]);
  const applyChatClear = useCallback((phone, remove = false) => {
    if (activeRef.current?.phone !== phone) return;
    messageRequest.current++; setMessages([]); setCursor(null); setReply(null); setLoadingOlder(false); setMessagesLoading(false);
    if (remove) { syncCursorRef.current = null; setSyncStatus(""); setActive(null); activeRef.current = null; setPanel(null); }
    else if (syncCursorRef.current?.phone === phone) catchUp();
    else openChat(phone);
  }, [catchUp, openChat]);
  const applyMessageHide = useCallback((phone, id) => {
    if (activeRef.current?.phone !== phone) return;
    messageRequest.current++; setMessages(prev => prev.filter(m => m._id !== id)); setLoadingOlder(false); setMessagesLoading(false);
    if (syncCursorRef.current?.phone === phone) catchUp(); else openChat(phone);
  }, [catchUp, openChat]);
  const loadContacts = useCallback(async (nextPage = 1) => {
    if (!userRef.current) return;
    const request = ++contactRequest.current;
    setContactsLoading(true); setContactError("");
    try {
      const r = await api.contacts({ q: debouncedSearch, filter, page: nextPage });
      if (request !== contactRequest.current) return;
      setContacts(prev => nextPage === 1 ? r.contacts : [...new Map([...prev, ...r.contacts].map(c => [c.phone, c])).values()]); setHasMore(r.hasMore); setPage(nextPage);
      setActive(prev => { const fresh = r.contacts.find(c => c.phone === prev?.phone); return fresh ? { ...prev, ...fresh } : prev; });
    } catch (err) { if (request === contactRequest.current) setContactError(err.message); }
    finally { if (request === contactRequest.current) setContactsLoading(false); }
  }, [api, debouncedSearch, filter]);
  refreshRef.current = loadContacts;

  useEffect(() => {
    let alive = true; demoOpened.current = false; setReady(false); clearWorkspace(); setSearch(""); setFilter("all");
    if (!api.demo && !getToken()) { setReady(true); return; }
    Promise.all([api.me(), api.config()]).then(([u, c]) => { if (alive) { setUser(u); setConfig(c); setConnected(api.demo); } }).catch(err => { if (alive) { if (!api.demo) clearSession(); toast(err.message, true); } }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; sessionEpoch.current++; messageRequest.current++; contactRequest.current++; };
  }, [api, toast, clearWorkspace]);
  useEffect(() => { if (user) loadContacts(); }, [user?._id, loadContacts]);
  useEffect(() => { if (api.demo && user && contacts.length && !demoOpened.current) { demoOpened.current = true; openChat(contacts[0]); } }, [api, user?._id, contacts, openChat]);
  useEffect(() => {
    if (!user) return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = user.preferences?.theme === "dark" || user.preferences?.theme === "system" && mq.matches ? "dark" : "light"; };
    apply(); mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply);
  }, [user?.preferences?.theme, user?._id]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const install = e => { e.preventDefault(); installPrompt.current = e; };
    window.addEventListener("online", update); window.addEventListener("offline", update); window.addEventListener("beforeinstallprompt", install);
    const timer = setInterval(() => setTick(Date.now()), 60000);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener("beforeinstallprompt", install); clearInterval(timer); clearTimeout(toastTimer.current); };
  }, []);
  useEffect(() => {
    const unauth = event => {
      if (api.demo) return;
      clearSession(); clearWorkspace(); setReady(true);
      document.documentElement.dataset.theme = "light";
      toast(event.detail?.message || "Session expired. Please sign in again.", !event.detail?.message);
    };
    window.addEventListener("omsai:unauthorized", unauth); return () => window.removeEventListener("omsai:unauthorized", unauth);
  }, [api, clearWorkspace, toast]);
  useEffect(() => {
    const shortcut = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && activeRef.current) { e.preventDefault(); setPanel({ type: "search", phone: activeRef.current.phone }); }
      if (e.key === "Escape" && !dialog && !image) { setRowMenu(null); setChatMenu(false); setSidebarMenu(false); setReply(null); setPanel(null); }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, [dialog, image]);
  useEffect(() => {
    if (!user) return;
    let alive = true, refreshTimer;
    function refreshSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (alive) refreshRef.current(); }, 160); }
    async function event(type, payload = {}) {
      if (!alive) return;
      if (["message:new", "message:update"].includes(type)) {
        try {
          const m = await api.message(payload.id);
          if (!alive) return;
          if (activeRef.current?.phone === m.phone) {
            if (aroundRef.current && type === "message:new") { setNewCount(n => n + 1); setShowDown(true); }
            else { if (atBottom.current || m.direction === "outgoing") shouldScroll.current = true; else if (type === "message:new") { setNewCount(n => n + 1); setShowDown(true); } setMessages(prev => upsertMessage(prev, m)); }
            if (type === "message:new" && m.direction === "incoming" && !document.hidden && !aroundRef.current && atBottom.current) api.readChat(m.phone, m.receivedAt || m.createdAt).catch(() => {});
          }
          const contact = contactsRef.current.find(c => c.phone === m.phone);
          if (type === "message:new" && m.direction === "incoming" && (document.hidden || activeRef.current?.phone !== m.phone) && !isMuted(contact)) {
            if (userRef.current.preferences?.sound) playNotification();
            if (userRef.current.preferences?.desktopNotifications && "Notification" in window && Notification.permission === "granted") {
              const notification = new Notification(contact?.name || formatPhone(m.phone), { body: "New message", icon: "/icon-192.png", tag: m.phone });
              notification.onclick = () => { window.focus(); openChat(m.phone); notification.close(); };
            }
          }
        } catch { catchUp(); /* Durable catch-up also handles a lost socket fetch. */ }
        refreshSoon();
      } else if (type === "message:hidden") {
        applyMessageHide(payload.phone, payload.id);
        setRevision(n => n + 1); refreshSoon();
      } else if (type === "chat:cleared") {
        // A stale response must not resurrect messages cleared in this or
        // another session. Catch up again using the server's clear boundary.
        applyChatClear(payload.phone);
        setRevision(n => n + 1); refreshSoon();
      } else {
        if (type === "chat:update") {
          setRevision(n => n + 1);
          const phone = activeRef.current?.phone;
          if (phone && (!payload.phone || payload.phone === phone)) api.contact(phone).then(c => { if (alive && activeRef.current?.phone === phone) setActive(c); }).catch(() => {});
        }
        refreshSoon();
      }
    }
    let socket, unsubscribe;
    if (api.demo) { setConnected(true); unsubscribe = api.subscribe(event); }
    else {
      setConnected(false); socket = connectSocket(); socket.on("connect", () => { setConnected(true); refreshSoon(); catchUp(); }); socket.on("disconnect", () => setConnected(false)); socket.on("connect_error", () => setConnected(false));
      for (const type of ["message:new", "message:update", "chat:update", "chat:state", "chat:cleared", "message:hidden"]) socket.on(type, p => event(type, p));
    }
    const onVisible = () => { if (!document.hidden) { refreshSoon(); catchUp(); } };
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearTimeout(refreshTimer); unsubscribe?.(); socket?.disconnect(); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [api, user?._id, openChat, catchUp, applyChatClear, applyMessageHide]);
  useEffect(() => { if (shouldScroll.current && !messagesLoading) { shouldScroll.current = false; scrollToBottom(); } }, [messages, messagesLoading, scrollToBottom]);
  useEffect(() => {
    if (!contentRef.current || !window.ResizeObserver) return;
    const observer = new ResizeObserver(() => { if (atBottom.current && !aroundRef.current) scrollToBottom(); }); observer.observe(contentRef.current); return () => observer.disconnect();
  }, [active?.phone, messagesLoading, scrollToBottom]);

  async function refreshActive(phone) {
    const session = sessionEpoch.current;
    const c = await api.contact(phone);
    if (session !== sessionEpoch.current) return;
    if (activeRef.current?.phone === phone) setActive(c);
    refreshRef.current(); return c;
  }
  async function setChatState(contact, changes, label) {
    const session = sessionEpoch.current;
    try {
      await api.chatState(contact.phone, changes);
      if (session !== sessionEpoch.current) return;
      if (changes.manualUnread && activeRef.current?.phone === contact.phone) { messageRequest.current++; setActive(null); activeRef.current = null; setPanel(null); setReply(null); }
      await refreshActive(contact.phone); if (label && session === sessionEpoch.current) toast(label);
    } catch (err) { toast(err.message, true); }
  }
  async function submit(kind, data) {
    const phone = activeRef.current?.phone, session = sessionEpoch.current;
    if (!phone) throw new Error("Select a chat before sending.");
    try {
      const m = await api[kind]({ ...data, phone });
      if (session !== sessionEpoch.current) return m;
      if (activeRef.current?.phone === phone) { setMessages(prev => upsertMessage(prev, m)); shouldScroll.current = true; setReply(null); }
      refreshRef.current(); return m;
    } catch (err) {
      if (err.messageId && session === sessionEpoch.current) { try { const m = await api.message(err.messageId); if (session === sessionEpoch.current && activeRef.current?.phone === phone) setMessages(prev => upsertMessage(prev, m)); } catch { /* state unavailable */ } }
      throw err;
    }
  }
  async function downloadMessage(m) {
    try { const blob = await api.media(m._id); downloadBlob(blob, m.filename || `attachment-${m._id}`); }
    catch (err) { toast(err.message, true); }
  }
  async function messageAction(action, m) {
    if (action === "reply") return setReply(m);
    if (action === "forward") return setDialog({ type: "forward", message: m });
    if (action === "info") return setDialog({ type: "info", message: m });
    if (action === "download") return downloadMessage(m);
    if (action === "save-contact") return setDialog({ type: "new-contact", initial: m.contacts?.[0], title: "Save shared contact" });
    if (action === "delete") return setDialog({ type: "confirm", title: "Delete message for me?", text: "This hides the message only for your account in this app. It does not unsend it, remove it from the recipient's phone, or delete it for other workspace accounts.", actionLabel: "Delete for me", danger: true, onConfirm: async () => { await api.deleteMessage(m._id); applyMessageHide(m.phone, m._id); if (reply?._id === m._id) setReply(null); setRevision(n => n + 1); refreshRef.current(); toast("Message hidden for you"); } });
    if (action === "star") {
      try { await api.starMessage(m._id, !m.starred); setMessages(prev => prev.map(x => x._id === m._id ? { ...x, starred: !m.starred } : x)); setRevision(n => n + 1); toast(m.starred ? "Star removed" : "Message starred"); } catch (err) { toast(err.message, true); }
    }
    if (action === "copy") {
      const text = m.type === "location" ? `https://www.openstreetmap.org/?mlat=${m.location.latitude}&mlon=${m.location.longitude}` : m.message || messagePreview(m);
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else { const el = document.createElement("textarea"); el.value = text; el.style.position = "fixed"; el.style.opacity = "0"; document.body.appendChild(el); el.select(); const copied = document.execCommand("copy"); el.remove(); if (!copied) throw new Error(); }
        toast("Message copied");
      } catch { toast("Your browser blocked clipboard access. Select and copy the text manually.", true); }
    }
  }
  function confirmClear(contact, remove = false) {
    setDialog({ type: "confirm", title: remove ? "Remove this chat?" : "Clear chat for me?", text: remove ? "The chat will be hidden from your list, and your visible history and stars will be cleared. A new message can bring it back. The contact is not blocked; other accounts and the recipient are unchanged." : "This clears your visible history and stars for this chat in this app only. It does not delete messages from the recipient's phone or other accounts.", actionLabel: remove ? "Remove chat" : "Clear for me", danger: true, onConfirm: async () => {
      await (remove ? api.deleteChat(contact.phone) : api.clearChat(contact.phone));
      applyChatClear(contact.phone, remove);
      setRevision(n => n + 1); refreshRef.current(); toast(remove ? "Chat removed from your list" : "Chat cleared for you");
    } });
  }
  async function exportChat(contact) { try { downloadBlob(await api.exportChat(contact.phone), `chat-${contact.phone}.txt`); toast("Chat text exported"); } catch (err) { toast(err.message, true); } }
  function chatItems(contact) {
    return [
      { label: contact.pinned ? "Unpin chat" : "Pin chat", icon: Pin, action: () => setChatState(contact, { pinned: !contact.pinned }, contact.pinned ? "Chat unpinned" : "Chat pinned") },
      { label: contact.archived ? "Unarchive chat" : "Archive chat", icon: Archive, action: () => setChatState(contact, { archived: !contact.archived }, contact.archived ? "Chat unarchived" : "Chat archived in this app") },
      { label: isMuted(contact) ? "Unmute notifications" : "Mute notifications", icon: BellOff, action: () => setChatState(contact, { mutedUntil: isMuted(contact) ? null : "2099-01-01T00:00:00.000Z" }, isMuted(contact) ? "Chat unmuted" : "Chat muted in this app") },
      { label: contact.hasUnread ? "Mark as read" : "Mark as unread", icon: contact.hasUnread ? MailOpen : Mail, action: async () => { if (contact.hasUnread) { try { const r = await api.readChat(contact.phone); if (r.warning) toast(r.warning, true); refreshRef.current(); } catch (err) { toast(err.message, true); } } else setChatState(contact, { manualUnread: true }, "Marked unread"); } },
      { separator: true }, { label: "Contact info", icon: Info, action: () => { if (activeRef.current?.phone !== contact.phone) openChat(contact); setPanel({ type: "contact" }); } },
      { label: "Export chat text", icon: Download, action: () => exportChat(contact) },
      { label: "Clear chat for me", icon: Trash2, danger: true, action: () => confirmClear(contact) },
      { label: "Remove chat", icon: X, danger: true, action: () => confirmClear(contact, true) }
    ];
  }
  function leaveSession() {
    try { for (const key of Object.keys(localStorage)) if (key.startsWith(`omsai-draft-${user?._id}-`)) localStorage.removeItem(key); } catch { /* optional storage */ }
    clearSession(); clearWorkspace();
    try { localStorage.setItem("omsai_mode", "real"); } catch { /* Optional preference storage. */ }
    setMode("real"); setReady(true); document.documentElement.dataset.theme = "light";
  }
  async function install() {
    if (installPrompt.current) { await installPrompt.current.prompt(); await installPrompt.current.userChoice; installPrompt.current = null; }
    else toast("Use your browser menu → Install app / Add to Home screen. Installation needs HTTPS and browser support.");
  }
  async function olderMessages() {
    if (!cursor || loadingOlder || !active) return;
    const request = messageRequest.current, phone = active.phone;
    setLoadingOlder(true); const el = scrollRef.current, oldHeight = el?.scrollHeight || 0, oldTop = el?.scrollTop || 0;
    try {
      const r = await api.messages(phone, cursor);
      if (request !== messageRequest.current || activeRef.current?.phone !== phone) return;
      setMessages(prev => mergeCatchUp(r.messages, { messages: prev })); setCursor(r.nextCursor);
      requestAnimationFrame(() => { if (request === messageRequest.current && el) el.scrollTop = el.scrollHeight - oldHeight + oldTop; });
    } catch (err) { if (request === messageRequest.current) toast(err.message, true); }
    finally { if (request === messageRequest.current) setLoadingOlder(false); }
  }
  function selectResult(m) { setPanel(null); openChat(m.phone, m._id); }

  if (!ready) return <div className="app-loading"><span className="brand-mark"><MessageCircle size={28} /></span><h2>OmSai Chat</h2><Spinner /><p>Opening your workspace…</p></div>;
  if (!user) return <><Login api={api} onLogin={async u => { setUser(u); try { setConfig(await api.config()); } catch (err) { toast(err.message, true); } }} onDemo={() => { localStorage.setItem("omsai_mode", "demo"); setMode("demo"); }} /><Toast value={notice} onClose={() => setNotice(null)} /></>;
  const windowState = replyWindow(active?.lastInboundAt, tick);
  return <div className="viewport-shell">
    {api.demo && <div className="demo-banner"><span className="demo-dot" /><strong>Interactive demo</strong><span>Fictional chats. No WhatsApp messages are sent.</span><button onClick={leaveSession}>Connect your API<ArrowRightIcon /></button></div>}
    <div className={`app-shell ${active ? "has-active-chat" : ""} ${panel ? "has-panel" : ""}`}>
      <nav className="rail" aria-label="Main navigation"><a className="rail-brand" href="#" aria-label="OmSai Chat home" onClick={e => { e.preventDefault(); setPanel(null); setFilter("all"); }}><MessageCircle size={25} /></a><div className="rail-top"><IconButton label="Chats" className={!panel && filter !== "archived" ? "selected" : ""} onClick={() => { setPanel(null); setFilter("all"); }}><MessageCircle size={23} /></IconButton><IconButton label="Contacts" className={panel?.type === "contacts" ? "selected" : ""} onClick={() => setPanel({ type: "contacts" })}><UsersRound size={22} /></IconButton>{user.role === "admin" && <><IconButton label="Template Sender" className={panel?.type === "sender" ? "selected" : ""} onClick={() => setPanel({ type: "sender" })}><Send size={21} /></IconButton><IconButton label="Incoming Safety" className={panel?.type === "safety" ? "selected" : ""} onClick={() => setPanel({ type: "safety" })}><ShieldCheck size={22} /></IconButton><IconButton label="System Usage" className={panel?.type === "usage" ? "selected" : ""} onClick={() => setPanel({ type: "usage" })}><Gauge size={22} /></IconButton></>}<IconButton label="Starred messages" className={panel?.type === "starred" ? "selected" : ""} onClick={() => setPanel(panel?.type === "starred" ? null : { type: "starred" })}><Star size={22} /></IconButton><IconButton label="Archived chats" className={filter === "archived" ? "selected" : ""} onClick={() => { setPanel(null); setFilter(filter === "archived" ? "all" : "archived"); setSearch(""); }}><Archive size={22} /></IconButton></div><div className="rail-bottom"><IconButton label="Settings" className={panel?.type === "settings" ? "selected" : ""} onClick={() => setPanel(panel?.type === "settings" ? null : { type: "settings" })}><SettingsIcon size={23} /></IconButton><button className="profile-button" title="Your profile & settings" aria-label="Your profile and settings" onClick={() => setPanel({ type: "settings" })}><Avatar name={user.displayName || user.username} size={33} /></button></div></nav>
      <aside className="chat-sidebar" aria-label="Chat list"><header className="sidebar-header"><div><h1>{filter === "archived" ? "Archived" : "Chats"}</h1><span className="workspace-label"><i className={connected ? "connected" : ""} />{api.demo ? "Your everyday connections" : connected ? "Workspace connected" : "Connecting to workspace…"}</span></div><div className="sidebar-header-actions"><IconButton label="New chat" onClick={() => setDialog({ type: "new-contact" })}><MessageSquarePlus size={22} /></IconButton><div className="menu-anchor"><IconButton label="Chat list menu" onClick={() => setSidebarMenu(v => !v)}><MoreVertical size={22} /></IconButton>{sidebarMenu && <Menu onClose={() => setSidebarMenu(false)} items={[{ label: "New chat", icon: MessageSquarePlus, action: () => setDialog({ type: "new-contact" }) }, { label: "Manage contacts", icon: UsersRound, action: () => setPanel({ type: "contacts" }) }, ...(user.role === "admin" ? [{ label: "Template Sender", icon: Send, action: () => setPanel({ type: "sender" }) }, { label: "Incoming Safety", icon: ShieldCheck, action: () => setPanel({ type: "safety" }) }, { label: "System Usage", icon: Gauge, action: () => setPanel({ type: "usage" }) }] : []), { label: "Search all messages", icon: Search, action: () => setPanel({ type: "search", initialQuery: search }) }, { label: "Starred messages", icon: Star, action: () => setPanel({ type: "starred" }) }, { label: "Settings", icon: SettingsIcon, action: () => setPanel({ type: "settings" }) }, { separator: true }, { label: api.demo ? "Leave demo" : "Sign out", icon: ExternalLink, action: leaveSession }]} />}</div></div></header>
        <div className="sidebar-search"><div className="search-field"><Search size={18} /><input ref={searchRef} aria-label="Search chats" placeholder="Search or start a new chat" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && search.trim()) setPanel({ type: "search", initialQuery: search }); }} />{search ? <IconButton label="Clear chat search" onClick={() => setSearch("")}><X size={15} /></IconButton> : <kbd>⌘ K</kbd>}</div></div>
        <div className="chat-filters">{[["all", "All"], ["unread", "Unread"], ["archived", "Archived"]].map(([id, label]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div>
        {!online && !api.demo && <div className="offline-note"><WifiOff size={16} />You're offline. Reconnect to send.</div>}
        {filter === "archived" && <p className="archive-explainer">Archived here, not on your personal WhatsApp.</p>}
        <div className="chat-list">{contactsLoading && !contacts.length ? <div className="loading-line"><Spinner /></div> : contactError ? <div className="sidebar-error"><p>{contactError}</p><button className="button secondary small" onClick={() => loadContacts()}><RefreshCw size={15} />Try again</button></div> : !contacts.length ? <EmptyState icon={filter === "archived" ? Archive : search ? Search : MessageCircle} title={search ? "No chats found" : filter === "unread" ? "You're all caught up" : filter === "archived" ? "A quieter inbox" : "Start with hello"}>{search ? "Try a name, number or recent message." : filter === "unread" ? "There are no unread chats right now." : filter === "archived" ? "Archived conversations will appear here." : "Add a contact to start a conversation."}</EmptyState> : contacts.map((c, i) => <React.Fragment key={c.phone}>{c.pinned && (i === 0 || !contacts[i - 1]?.pinned) && <div className="list-section-label"><Pin size={11} />PINNED</div>}{!c.pinned && i > 0 && contacts[i - 1]?.pinned && <div className="list-section-label">ALL CONVERSATIONS</div>}<div className={`chat-row ${active?.phone === c.phone ? "selected" : ""} ${c.hasUnread ? "unread" : ""} ${rowMenu === c.phone ? "menu-open" : ""}`}><button className="chat-open" onClick={() => { openChat(c); if (["contact", "gallery"].includes(panel?.type)) setPanel(null); }}><Avatar name={c.name || c.phone} /><div className="chat-row-copy"><div><strong>{c.name || formatPhone(c.phone)}</strong><time>{sidebarTime(c.lastMessageAt || c.lastActivityAt)}</time></div><div className="chat-preview"><span>{c.lastDirection === "outgoing" && <StatusIcon status={c.lastStatus} size={15} />}{c.lastMessage || "Start a conversation"}</span><div>{isMuted(c) && <BellOff size={14} />}{c.pinned && <Pin size={13} fill="currentColor" />}{c.hasUnread && <i className="unread-dot" aria-label="Unread message" />}</div></div></div></button><div className="chat-row-menu"><IconButton label={`Chat options for ${c.name || c.phone}`} onClick={() => setRowMenu(rowMenu === c.phone ? null : c.phone)}><ChevronDown size={18} /></IconButton></div>{rowMenu === c.phone && <Menu items={chatItems(c)} onClose={() => setRowMenu(null)} className="contact-row-menu" />}</div></React.Fragment>)}{hasMore && <button className="load-more-chats" disabled={contactsLoading} onClick={() => loadContacts(page + 1)}>{contactsLoading ? <Spinner small /> : "Load more chats"}</button>}{search.trim() && <button className="search-all-link" onClick={() => setPanel({ type: "search", initialQuery: search })}><Search size={16} />Search all message history<ChevronRight size={15} /></button>}</div>
        <footer className="sidebar-footer"><ShieldCheck size={13} /><span>Simple chats. Thoughtfully organized.</span></footer>
      </aside>
      <main className={`thread font-${user.preferences?.fontSize || "medium"}`}>
        {active ? <><header className="thread-header"><IconButton label="Back to chat list" className="mobile-back" onClick={() => { messageRequest.current++; setActive(null); activeRef.current = null; setPanel(null); setReply(null); }}><ArrowLeft size={22} /></IconButton><button className="thread-person" onClick={() => setPanel(panel?.type === "contact" ? null : { type: "contact" })}><Avatar name={active.name || active.phone} size={42} /><div><strong>{active.name || formatPhone(active.phone)}</strong><span>{active.archived ? "Archived in this app" : isMuted(active) ? "Notifications muted" : "Tap for contact info"}</span></div></button><div className="thread-actions"><IconButton label="Sync stored messages" onClick={catchUp}><RefreshCw size={18} /></IconButton><IconButton label="Search this conversation" className={panel?.type === "search" ? "active" : ""} onClick={() => setPanel({ type: "search", phone: active.phone })}><Search size={21} /></IconButton><div className="menu-anchor"><IconButton label="Conversation menu" onClick={() => setChatMenu(v => !v)}><MoreVertical size={22} /></IconButton>{chatMenu && <Menu items={chatItems(active)} onClose={() => setChatMenu(false)} />}</div></div></header>
          <div className={`conversation-window-note ${windowState.open ? "open" : "closed"}`}><Info size={13} /><span>{api.demo ? "Demo chat · no real messages sent" : windowState.open ? "Official Cloud API" : "24-hour reply window closed"}</span>{!api.demo && windowState.open && <span className="window-remaining">{windowState.label}</span>}{!windowState.open && <button onClick={() => setDialog({ type: "template" })}>Use approved template<ChevronRight size={13} /></button>}</div>
          {syncStatus && <div className="sync-note" role="status"><RefreshCw size={12} /><span>{syncStatus}</span></div>}<div className={`message-area wallpaper-${user.preferences?.wallpaper || "doodle"}`}><div className="message-scroll" ref={scrollRef} onScroll={e => { const el = e.currentTarget; const distance = el.scrollHeight - el.scrollTop - el.clientHeight; atBottom.current = distance < 120; setShowDown(distance > 300); if (distance < 80) setNewCount(0); }}><div className="message-content" ref={contentRef}>{messagesLoading ? <div className="loading-line message-loading"><Spinner /></div> : messageError ? <div className="thread-error"><p>{messageError}</p><button className="button secondary" onClick={() => openChat(active)}>Try again</button></div> : <>{cursor && <div className="load-older-wrap"><button className="load-older" onClick={olderMessages} disabled={loadingOlder}>{loadingOlder ? <Spinner small /> : <RefreshCw size={13} />}Load older messages</button></div>}<div className="chat-privacy-note"><ShieldCheck size={12} />Your chat organization stays in this workspace. Cloud API rules apply.</div>{!messages.length && <div className="new-chat-intro"><Avatar name={active.name || active.phone} size={60} /><h3>Say hello to {active.name?.split(" ")[0] || "your contact"}</h3><p>{windowState.open ? "Your conversation starts here." : "Ask them to message your Cloud API number, or send an approved template with their permission."}</p>{!windowState.open && <button className="button secondary small" onClick={() => setDialog({ type: "template" })}>Choose a template</button>}</div>}{messages.map((m, i) => <React.Fragment key={m._id}>{(i === 0 || new Date(m.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString()) && <div className="day-divider"><span>{dayLabel(m.createdAt)}</span></div>}<MessageBubble message={m} contactName={active.name || "Contact"} api={api} onAction={messageAction} onReact={async (message, emoji) => { const session = sessionEpoch.current; try { const updated = await api.react(message._id, emoji); if (session === sessionEpoch.current && activeRef.current?.phone === updated.phone) setMessages(prev => upsertMessage(prev, updated)); } catch (err) { if (session === sessionEpoch.current) toast(err.message, true); } }} onImage={setImage} onJump={id => openChat(active, id)} highlighted={highlight === m._id} /></React.Fragment>)}</>}</div></div>{(showDown || around) && <button className={`jump-down ${around ? "with-label" : ""}`} aria-label={around ? "Jump to latest messages" : "Scroll to latest message"} onClick={() => around ? openChat(active) : scrollToBottom(true)}>{newCount > 0 && <span className="new-message-count">{newCount}</span>}<ArrowDown size={19} />{around && <span>Latest messages</span>}</button>}</div>
          <Composer key={`${user._id}-${active.phone}`} contact={active} user={user} reply={reply} onCancelReply={() => setReply(null)} onSendText={data => submit("sendText", data)} onSendMedia={data => submit("sendMedia", data)} onLocation={() => setDialog({ type: "location" })} onContact={() => setDialog({ type: "share-contact" })} toast={toast} disabled={!api.demo && !online} windowOpen={windowState.open} />
        </> : <Welcome onNewChat={() => setDialog({ type: "new-contact" })} onSearch={() => searchRef.current?.focus()} />}
      </main>
      {user.role === "admin" && panel?.type === "sender" && <Suspense fallback={<div className="modal-backdrop"><Spinner /></div>}><TemplateSender api={api} onClose={() => setPanel(null)} toast={toast} /></Suspense>}
    {user.role === "admin" && panel?.type === "usage" && <Suspense fallback={<div className="modal-backdrop"><Spinner /></div>}><SystemUsage api={api} onClose={() => setPanel(null)} onOpenSafety={() => setPanel({ type: "safety" })} onOpenSender={() => setPanel({ type: "sender" })} /></Suspense>}
    {user.role === "admin" && panel?.type === "safety" && <Suspense fallback={<div className="modal-backdrop"><Spinner /></div>}><IncomingSafety api={api} onClose={() => setPanel(null)} toast={toast} /></Suspense>}
    {panel?.type === "settings" && <Settings user={user} config={config} api={api} onClose={() => setPanel(null)} onUpdate={async data => { const u = await api.patchMe(data); setUser(u); }} onLogout={leaveSession} toast={toast} onInstall={install} onReset={() => setDialog({ type: "confirm", title: "Reset interactive demo?", text: "This resets fictional demo chats and settings on this browser. Your live database and WhatsApp account are not touched.", actionLabel: "Reset demo", onConfirm: async () => { const u = await api.resetDemo(); setUser(u); setPanel(null); setActive(null); activeRef.current = null; demoOpened.current = false; setSearch(""); setFilter("all"); refreshRef.current(); toast("Demo reset"); } })} />}
      {["search", "starred"].includes(panel?.type) && <MessageListPanel key={`${panel.type}-${panel.phone || "all"}-${panel.initialQuery || ""}`} type={panel.type} api={api} contacts={contacts} initialQuery={panel.initialQuery} phone={panel.phone} contactName={active?.name} onClose={() => setPanel(null)} onSelect={selectResult} onAction={messageAction} revision={revision} />}
      {panel?.type === "contact" && active && <ContactPanel key={active.phone} contact={active} onClose={() => setPanel(null)} onSave={async data => { await api.editContact(active.phone, data); await refreshActive(active.phone); }} onState={data => setChatState(active, data)} onGallery={() => setPanel({ type: "gallery" })} onExport={() => exportChat(active)} onClear={() => confirmClear(active)} onDelete={() => confirmClear(active, true)} onSaveContact={() => setDialog({ type: "new-contact", title: "Save contact", initial: { name: active.name, phone: active.phone } })} onManage={() => setPanel({ type: "contacts" })} toast={toast} />}
      {panel?.type === "gallery" && active && <GalleryPanel contact={active} api={api} onClose={() => setPanel(null)} onBack={() => setPanel({ type: "contact" })} onSelect={setImage} onDownload={downloadMessage} onJump={selectResult} />}
    </div>
    {panel?.type === "contacts" && <Suspense fallback={<div className="modal-backdrop"><Spinner /></div>}><ContactsManager api={api} toast={toast} revision={revision} onClose={() => setPanel(null)} onChanged={() => {
      refreshRef.current(); setRevision(n => n + 1);
      const phone = activeRef.current?.phone; if (phone) refreshActive(phone).catch(() => {});
    }} onChat={contact => { setPanel(null); setSearch(""); setFilter("all"); refreshRef.current(); openChat(contact); }} /></Suspense>}
    {dialog?.type === "new-contact" && <ContactDialog initial={dialog.initial} title={dialog.title || "New chat"} onClose={() => setDialog(null)} onSave={async data => { const c = await api.addContact(data); setDialog(null); setPanel(null); setFilter("all"); setSearch(""); refreshRef.current(); openChat(c); toast("Contact saved in this app"); }} />}
    {dialog?.type === "confirm" && <ConfirmDialog {...dialog} onClose={() => setDialog(null)} />}
    {dialog?.type === "forward" && <ForwardDialog message={dialog.message} api={api} onClose={() => setDialog(null)} onDone={(m, c) => { setDialog(null); if (active?.phone === c.phone) setMessages(prev => upsertMessage(prev, m)); refreshRef.current(); toast(`Message forwarded to ${c.name || formatPhone(c.phone)}`); }} />}
    {dialog?.type === "location" && <LocationDialog onClose={() => setDialog(null)} onSend={async data => { await submit("sendLocation", { ...data, replyToId: reply?._id }); setDialog(null); toast("Location shared"); }} />}
    {dialog?.type === "share-contact" && <ShareContactDialog contacts={contacts} onClose={() => setDialog(null)} onSend={async data => { await submit("sendContact", { ...data, replyToId: reply?._id }); setDialog(null); toast("Contact shared"); }} />}
    {dialog?.type === "template" && active && <TemplateDialog contact={active} api={api} onClose={() => setDialog(null)} onSent={m => { setMessages(prev => upsertMessage(prev, m)); shouldScroll.current = true; setDialog(null); refreshRef.current(); toast("Template sent. Free-form replies unlock when the contact messages you."); }} />}
    {dialog?.type === "info" && <MessageInfo message={messages.find(m => m._id === dialog.message._id) || dialog.message} onClose={() => setDialog(null)} />}
    {image && <ImageViewer image={image} onClose={() => setImage(null)} onDownload={() => downloadMessage(image.message)} />}
    <Toast value={notice} onClose={() => setNotice(null)} />
  </div>;
}
function ArrowRightIcon() { return <ChevronRight size={14} />; }
