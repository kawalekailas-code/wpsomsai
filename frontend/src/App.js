import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = process.env.REACT_APP_API;

// ─── Google Font inject ───────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ─── Global CSS ───────────────────────────────────────────────────
const globalStyle = document.createElement("style");
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
  input, textarea, select, button { font-family: 'DM Sans', sans-serif; }
  .contact-item { transition: background 0.15s ease; }
  .contact-item:hover { background: var(--hover) !important; }
  .btn-hover { transition: opacity 0.15s, transform 0.1s; }
  .btn-hover:hover { opacity: 0.88; transform: translateY(-1px); }
  .tab-btn { transition: all 0.2s ease; }
  .msg-bubble { transition: box-shadow 0.15s; }
  .slide-in { animation: slideIn 0.2s ease; }
  @keyframes slideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .pulse { animation: pulse 1.5s ease infinite; }
`;
document.head.appendChild(globalStyle);

// ─── Constants ────────────────────────────────────────────────────
const LABEL_META = {
  "Hot Lead":  { color: "#ef4444", bg: "#fef2f2", icon: "🔥" },
  "Cold Lead": { color: "#3b82f6", bg: "#eff6ff", icon: "❄️" },
  "Customer":  { color: "#10b981", bg: "#ecfdf5", icon: "✅" },
  "VIP":       { color: "#f59e0b", bg: "#fffbeb", icon: "⭐" },
  "":          { color: "#9ca3af", bg: "#f3f4f6", icon: ""  }
};

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f43f5e",
  "#f97316","#eab308","#10b981","#14b8a6",
  "#3b82f6","#06b6d4","#a855f7","#d946ef"
];

const getAvatarColor = (str = "") => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const QUICK_REPLIES = [
  "नमस्कार! आम्ही लवकरच reply करतो 🙏",
  "धन्यवाद तुमच्या संदेशासाठी!",
  "कृपया थोडा वेळ थांबा, आम्ही check करतो.",
  "तुमची order confirm झाली ✅",
  "आजच आम्हाला call करा: 9XXXXXXXXX"
];

const EMOJI_LIST = ["😊","😂","🙏","👍","❤️","🔥","✅","⭐","💯","😅","🎉","👏","🤝","💪","📞","📦","💰","🚀","⚡","😍","🙌","👋","😁","🤔","😮","💬","📱","🛒","✨","🎁"];

const WALLPAPERS = [
  { name: "Sand",    value: "#e8ddd0" },
  { name: "Dark",    value: "#0b141a" },
  { name: "Slate",   value: "#e2e8f0" },
  { name: "Mint",    value: "#d1fae5" },
  { name: "Lavender",value: "#ede9fe" },
  { name: "Rose",    value: "#ffe4e6" },
];

// ─── Reusable Components ───────────────────────────────────────────
const Avatar = ({ name = "", size = 38, style = {} }) => {
  const char = (name).charAt(0).toUpperCase() || "?";
  const bg   = getAvatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      color: "white", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.42, flexShrink: 0, ...style
    }}>{char}</div>
  );
};

const Toggle = ({ value, onChange }) => (
  <button onClick={onChange} style={{
    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
    background: value ? "#10b981" : "#d1d5db", position: "relative", transition: "background 0.25s"
  }}>
    <div style={{
      width: 18, height: 18, borderRadius: "50%", background: "white",
      position: "absolute", top: 3, left: value ? 23 : 3, transition: "left 0.25s",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
    }} />
  </button>
);

const Badge = ({ count }) => count > 0 ? (
  <span style={{
    background: "#10b981", color: "white", padding: "1px 7px",
    borderRadius: 20, fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center"
  }}>{count > 99 ? "99+" : count}</span>
) : null;

const LabelPill = ({ label, size = "sm" }) => {
  if (!label) return null;
  const m = LABEL_META[label] || LABEL_META[""];
  return (
    <span style={{
      background: m.bg, color: m.color, padding: size === "sm" ? "2px 7px" : "3px 10px",
      borderRadius: 20, fontSize: size === "sm" ? 10 : 12, fontWeight: 600,
      border: `1px solid ${m.color}22`
    }}>{m.icon} {label}</span>
  );
};

const BarChart = ({ days, dark }) => {
  const max = Math.max(...days.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80, padding: "0 4px" }}>
      {days.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: 9, color: dark ? "#8696a0" : "#94a3b8", fontWeight: 500 }}>{d.count}</div>
          <div style={{
            width: "100%", background: `linear-gradient(to top, #10b981, #34d399)`,
            borderRadius: "4px 4px 0 0", height: `${(d.count / max) * 60}px`,
            minHeight: d.count ? 6 : 2, boxShadow: "0 2px 8px #10b98133", transition: "height 0.5s"
          }} />
          <div style={{ fontSize: 9, color: dark ? "#8696a0" : "#94a3b8", fontWeight: 500 }}>{d.date}</div>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ icon, value, label, color, dark }) => (
  <div style={{
    background: dark ? "#1e293b" : "white", borderRadius: 14, padding: 16,
    border: `1px solid ${dark ? "#334155" : "#f1f5f9"}`,
    boxShadow: dark ? "none" : "0 1px 6px rgba(0,0,0,0.06)",
    display: "flex", flexDirection: "column", gap: 6
  }}>
    <div style={{ fontSize: 24 }}>{icon}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 11, color: dark ? "#8696a0" : "#94a3b8", fontWeight: 500 }}>{label}</div>
  </div>
);

// ─── LOGIN PAGE ───────────────────────────────────────────────────
const LoginPage = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    width: "100%", padding: "12px 16px", border: "1.5px solid #e2e8f0",
    borderRadius: 12, fontSize: 14, outline: "none", background: "#f8fafc",
    transition: "border-color 0.2s", fontFamily: "DM Sans, sans-serif", color: "#0f172a"
  };

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await axios.post(API + "/auth/login", { username, password });
      localStorage.setItem("crm_token", res.data.token);
      localStorage.setItem("crm_user", JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch (err) { setError(err.response?.data?.error || err.response?.data || "Login failed"); }
    setLoading(false);
  };

  const handleRegister = async () => {
    setError(""); setLoading(true);
    try {
      await axios.post(API + "/auth/register", { username, password, displayName });
      setMode("login"); setError("✅ Account created! Login करा.");
    } catch (err) { setError(err.response?.data?.error || err.response?.data || "Register failed"); }
    setLoading(false);
  };

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f4c3a 100%)",
      fontFamily: "DM Sans, sans-serif", position: "relative", overflow: "hidden"
    }}>
      {/* Background decoration */}
      <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)", top: -100, right: -100 }} />
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)", bottom: -100, left: -100 }} />

      <div style={{
        background: "rgba(255,255,255,0.97)", borderRadius: 24, padding: "40px 36px",
        width: "min(400px, 92vw)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
        backdropFilter: "blur(20px)", position: "relative"
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: "0 auto 14px",
            background: "linear-gradient(135deg, #075E54, #25D366)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, boxShadow: "0 8px 24px rgba(16,185,129,0.4)"
          }}>📱</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>WhatsApp CRM</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, fontWeight: 500 }}>by Somsai</div>
        </div>

        {/* Tab toggle */}
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 12, padding: 3, marginBottom: 24 }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
              flex: 1, padding: "9px 0", border: "none", borderRadius: 10, cursor: "pointer",
              background: mode === m ? "white" : "transparent",
              fontWeight: mode === m ? 700 : 500, fontSize: 13,
              color: mode === m ? "#0f172a" : "#94a3b8",
              boxShadow: mode === m ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.2s", textTransform: "capitalize"
            }}>{m === "login" ? "🔐 Login" : "✨ Register"}</button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <input style={inputStyle} placeholder="Display Name (optional)"
              value={displayName} onChange={e => setDisplayName(e.target.value)} />
          )}
          <input style={inputStyle} placeholder="Username"
            value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())} />
          <input style={inputStyle} type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())} />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13,
            background: error.includes("✅") ? "#ecfdf5" : "#fef2f2",
            color: error.includes("✅") ? "#059669" : "#dc2626",
            border: `1px solid ${error.includes("✅") ? "#a7f3d0" : "#fecaca"}`,
            fontWeight: 500
          }}>{error}</div>
        )}

        <button onClick={mode === "login" ? handleLogin : handleRegister}
          disabled={loading} className="btn-hover" style={{
            width: "100%", marginTop: 20, padding: "14px 0",
            background: loading ? "#e2e8f0" : "linear-gradient(135deg, #075E54, #10b981)",
            color: loading ? "#94a3b8" : "white", border: "none", borderRadius: 12,
            fontWeight: 700, fontSize: 15, cursor: loading ? "default" : "pointer",
            boxShadow: loading ? "none" : "0 6px 20px rgba(16,185,129,0.4)", letterSpacing: "0.2px"
          }}>
          {loading ? "⏳ Please wait..." : mode === "login" ? "Sign In →" : "Create Account →"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "#cbd5e1", marginTop: 16 }}>
          First registered user becomes Admin
        </div>
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState(null);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState("chats");

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [csvProgress, setCsvProgress] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [mktStats, setMktStats] = useState(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [tplName, setTplName] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplHeader, setTplHeader] = useState("");
  const [tplFooter, setTplFooter] = useState("");
  const [tplCategory, setTplCategory] = useState("MARKETING");
  const [tplWaName, setTplWaName] = useState("");
  const [campName, setCampName] = useState("");
  const [campTemplateId, setCampTemplateId] = useState("");
  const [campMessage, setCampMessage] = useState("");
  const [campLabelFilter, setCampLabelFilter] = useState("all");
  const [campUseWa, setCampUseWa] = useState(false);
  const [campStatus, setCampStatus] = useState("");

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("crm_dark") === "true");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem("crm_wallpaper") || "#e8ddd0");
  const [notifSound, setNotifSound] = useState(() => localStorage.getItem("crm_sound") !== "false");
  const [msgSearch, setMsgSearch] = useState("");
  const [msgSearchResults, setMsgSearchResults] = useState(null);
  const [showMsgSearch, setShowMsgSearch] = useState(false);

  const [stats, setStats] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastFilter, setBroadcastFilter] = useState("");
  const [broadcastSelected, setBroadcastSelected] = useState([]);
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const [reminders, setReminders] = useState([]);
  const [remPhone, setRemPhone] = useState("");
  const [remMsg, setRemMsg] = useState("");
  const [remDate, setRemDate] = useState("");

  const [users, setUsers] = useState([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [newUserDisplay, setNewUserDisplay] = useState("");
  const [newUserRole, setNewUserRole] = useState("agent");
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const bottomRef = useRef();
  const typingTimeout = useRef(null);

  // ── Theme ────────────────────────────────────────────────────────
  const D = darkMode;
  const T = {
    bg:       D ? "#0f172a" : "#f8fafc",
    panel:    D ? "#1e293b" : "white",
    sidebar:  D ? "#0f172a" : "white",
    border:   D ? "#334155" : "#f1f5f9",
    text:     D ? "#f1f5f9" : "#0f172a",
    subtext:  D ? "#8696a0" : "#94a3b8",
    chatbg:   wallpaper,
    outgoing: D ? "#16422e" : "#dcfce7",
    outText:  D ? "#d1fae5" : "#166534",
    incoming: D ? "#1e293b" : "white",
    inText:   D ? "#f1f5f9" : "#0f172a",
    input:    D ? "#1e293b" : "#f8fafc",
    inputText:D ? "#f1f5f9" : "#0f172a",
    active:   D ? "#1e3a2e" : "#f0fdf4",
    hover:    D ? "#1e293b" : "#f8fafc",
    header:   D ? "#0f172a" : "white",
    accent:   "#10b981",
    accentDark:"#059669"
  };
  document.documentElement.style.setProperty("--hover", T.hover);

  // ── Mobile resize ────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => { const m = window.innerWidth <= 768; setIsMobile(m); if (!m) setShowSidebar(true); };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    const user  = localStorage.getItem("crm_user");
    if (token && user) { axios.defaults.headers.common["Authorization"] = `Bearer ${token}`; setCurrentUser(JSON.parse(user)); }
    setAuthChecked(true);
    const interceptor = axios.interceptors.response.use(res => res, err => {
      if (err.response?.status === 401) {
        localStorage.removeItem("crm_token"); localStorage.removeItem("crm_user");
        delete axios.defaults.headers.common["Authorization"]; setCurrentUser(null);
      }
      return Promise.reject(err);
    });
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const handleLogin = (user) => {
    axios.defaults.headers.common["Authorization"] = `Bearer ${localStorage.getItem("crm_token")}`;
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("crm_token"); localStorage.removeItem("crm_user");
    delete axios.defaults.headers.common["Authorization"];
    setCurrentUser(null); setActive(null); setContacts([]); setMessages([]);
  };

  const playSound = useCallback(() => {
    if (!notifSound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, [notifSound]);

  const showBrowserNotif = useCallback((title, body) => {
    if (Notification.permission === "granted") new Notification(title, { body });
  }, []);

  useEffect(() => { if (Notification.permission === "default") Notification.requestPermission(); }, []);

  const loadContacts = async () => {
    try { const res = await axios.get(API + "/api/contacts"); setContacts(res.data); } catch {}
  };
  const loadStats = async () => {
    try { const res = await axios.get(API + "/api/stats"); setStats(res.data); } catch {}
  };
  const loadReminders = async () => {
    try { const res = await axios.get(API + "/api/reminders"); setReminders(res.data); } catch {}
  };
  const loadUsers = async () => {
    try { const res = await axios.get(API + "/auth/users"); setUsers(res.data); } catch {}
  };
  const loadTemplates = async () => {
    try { const res = await axios.get(API + "/api/marketing/templates"); setTemplates(res.data); } catch {}
  };
  const loadCampaigns = async () => {
    try {
      const [c, s] = await Promise.all([axios.get(API + "/api/marketing/campaigns"), axios.get(API + "/api/marketing/stats")]);
      setCampaigns(c.data); setMktStats(s.data);
    } catch {}
  };

  useEffect(() => { if (currentUser) { loadContacts(); loadReminders(); } }, [currentUser]);
  useEffect(() => {
    if (tab === "dashboard") loadStats();
    if (tab === "settings" && currentUser?.role === "admin") loadUsers();
    if (tab === "marketing") { loadTemplates(); loadCampaigns(); }
  }, [tab]);

  useEffect(() => { localStorage.setItem("crm_dark", darkMode); }, [darkMode]);
  useEffect(() => { localStorage.setItem("crm_wallpaper", wallpaper); }, [wallpaper]);
  useEffect(() => { localStorage.setItem("crm_sound", notifSound); }, [notifSound]);

  const openChat = async (contact) => {
    setActive(contact.phone); setActiveContact(contact);
    setNotesText(contact.notes || ""); setNotesSaved(false); setShowProfile(false);
    if (isMobile) setShowSidebar(false);
    setShowMsgSearch(false); setMsgSearch(""); setMsgSearchResults(null);
    setShowEmojiPicker(false); setShowQuickReplies(false);
    const res = await axios.get(API + "/api/messages/" + contact.phone);
    setMessages(res.data);
    await axios.post(API + "/api/seen/" + contact.phone);
    socket.emit("join", contact.phone);
    setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, unread: 0 } : c));
  };

  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => msg.phone === active ? (playSound(), [...prev, msg]) : prev);
      loadContacts();
      if (msg.direction === "incoming") { const c = contacts.find(c => c.phone === msg.phone); showBrowserNotif(c?.name || msg.phone, msg.message); if (msg.phone !== active) playSound(); }
    });
    socket.on("typing", (p) => { if (p === active) setTyping(true); });
    socket.on("stop_typing", (p) => { if (p === active) setTyping(false); });
    socket.on("message_status", ({ phone, status }) => setMessages(prev => prev.map(m => m.phone === phone ? { ...m, status } : m)));
    socket.on("csv_progress", (p) => setCsvProgress(p));
    socket.on("reminder_sent", ({ id }) => setReminders(prev => prev.filter(r => r._id !== id)));
    return () => { ["new_message","typing","stop_typing","message_status","csv_progress","reminder_sent"].forEach(e => socket.off(e)); };
  }, [active, contacts, playSound, showBrowserNotif]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const fn = (e) => {
      if (e.ctrlKey && e.key === "k") { e.preventDefault(); document.querySelector("#cs")?.focus(); }
      if (e.key === "Escape") { setShowEmojiPicker(false); setShowQuickReplies(false); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
    if (dt.toDateString() === t.toDateString()) return "Today";
    if (dt.toDateString() === y.toDateString()) return "Yesterday";
    return dt.toLocaleDateString("en-IN");
  };

  const sendMsg = async (msgText) => {
    const msg = (msgText || text).trim();
    if (!active || !msg) return;
    await axios.post(API + "/api/send", { phone: active, message: msg });
    setMessages(prev => [...prev, { phone: active, message: msg, direction: "outgoing", status: "sent", createdAt: new Date() }]);
    setText(""); setShowQuickReplies(false); setShowEmojiPicker(false);
    socket.emit("stop_typing", active);
  };

  const sendFile = async (e) => {
    const file = e.target.files[0]; if (!file || !active) return;
    const fd = new FormData(); fd.append("file", file); fd.append("phone", active);
    await axios.post(API + "/api/send/media", fd); e.target.value = "";
  };

  const updateLabel = async (phone, label) => {
    await axios.post(API + "/api/label/" + phone, { label });
    setContacts(prev => prev.map(c => c.phone === phone ? { ...c, label } : c));
    if (activeContact?.phone === phone) setActiveContact(prev => ({ ...prev, label }));
  };

  const saveNotes = async () => {
    await axios.post(API + "/api/notes/" + active, { notes: notesText });
    setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000);
  };

  const togglePin = async (phone, e) => { e.stopPropagation(); await axios.post(API + "/api/pin/" + phone); loadContacts(); };

  const searchMessages = async () => {
    if (!msgSearch.trim() || !active) return;
    const res = await axios.get(API + "/api/search-messages/" + active + "?q=" + msgSearch);
    setMsgSearchResults(res.data);
  };

  const broadcastSend = async () => {
    if (!broadcastMsg.trim() || !broadcastSelected.length) return alert("Message aur contacts select karo");
    setBroadcastStatus("sending");
    try {
      await axios.post(API + "/api/broadcast", { phones: broadcastSelected, message: broadcastMsg });
      setBroadcastStatus("done"); setBroadcastSelected([]); setBroadcastMsg("");
    } catch { setBroadcastStatus("error"); }
  };

  const addReminder = async () => {
    if (!remPhone || !remMsg || !remDate) return alert("Fill all fields");
    const contact = contacts.find(c => c.phone === remPhone);
    await axios.post(API + "/api/reminders", { phone: remPhone, name: contact?.name || remPhone, message: remMsg, dueAt: remDate });
    setRemPhone(""); setRemMsg(""); setRemDate(""); loadReminders();
  };

  const exportCSV = () => window.open(API + "/api/export-csv", "_blank");

  const bulkDelete = async () => {
    if (!bulkSelected.length || !window.confirm(`Delete ${bulkSelected.length} contacts?`)) return;
    await axios.post(API + "/api/bulk-delete", { phones: bulkSelected });
    if (bulkSelected.includes(active)) { setActive(null); setActiveContact(null); }
    setBulkSelected([]); setBulkSelectMode(false); loadContacts();
  };

  const saveTemplate = async () => {
    if (!tplName || !tplBody) return alert("Name and body required");
    if (editTemplate) await axios.put(API + "/api/marketing/templates/" + editTemplate._id, { name: tplName, body: tplBody, header: tplHeader, footer: tplFooter, category: tplCategory, waTemplateName: tplWaName });
    else await axios.post(API + "/api/marketing/templates", { name: tplName, body: tplBody, header: tplHeader, footer: tplFooter, category: tplCategory, waTemplateName: tplWaName });
    setShowNewTemplate(false); setEditTemplate(null); setTplName(""); setTplBody(""); setTplHeader(""); setTplFooter(""); setTplWaName("");
    loadTemplates();
  };

  const deleteTemplate = async (id) => { if (!window.confirm("Delete?")) return; await axios.delete(API + "/api/marketing/templates/" + id); loadTemplates(); };
  const startEditTemplate = (t) => { setEditTemplate(t); setTplName(t.name); setTplBody(t.body); setTplHeader(t.header||""); setTplFooter(t.footer||""); setTplCategory(t.category); setTplWaName(t.waTemplateName||""); setShowNewTemplate(true); };

  const sendCampaign = async () => {
    if (!campName || !campMessage) return alert("Name and message required");
    const phones = campLabelFilter === "all" ? contacts.map(c => c.phone) : contacts.filter(c => c.label === campLabelFilter).map(c => c.phone);
    if (!phones.length) return alert("No contacts found");
    setCampStatus("sending");
    try {
      await axios.post(API + "/api/marketing/campaigns", { name: campName, message: campMessage, phones, labelFilter: campLabelFilter, useWaTemplate: campUseWa });
      setCampStatus("done"); setCampName(""); setCampMessage(""); setCampLabelFilter("all"); loadCampaigns();
      setTimeout(() => { setShowNewCampaign(false); setCampStatus(""); }, 3000);
    } catch { setCampStatus("error"); }
  };

  const addUser = async () => {
    if (!newUserName || !newUserPass) return alert("Fill all fields");
    try { await axios.post(API + "/auth/register", { username: newUserName, password: newUserPass, displayName: newUserDisplay, role: newUserRole }); setNewUserName(""); setNewUserPass(""); setNewUserDisplay(""); loadUsers(); }
    catch (err) { alert(err.response?.data?.error || "Error"); }
  };

  const changePassword = async () => {
    if (!oldPass || !newPass) return;
    try { await axios.post(API + "/auth/change-password", { oldPassword: oldPass, newPassword: newPass }); setPassMsg("✅ Changed!"); setOldPass(""); setNewPass(""); setTimeout(() => setPassMsg(""), 3000); }
    catch (err) { setPassMsg("❌ " + (err.response?.data?.error || "Error")); }
  };

  const broadcastContacts = contacts.filter(c => !broadcastFilter || c.label === broadcastFilter);
  const filtered = contacts
    .filter(c => tab === "chats" ? c.lastMessage : true)
    .filter(c => !labelFilter || c.label === labelFilter)
    .filter(c => !unreadFilter || c.unread > 0)
    .filter(c => c.phone.includes(search) || (c.name||"").toLowerCase().includes(search.toLowerCase()) || (c.lastMessage||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.updatedAt)-new Date(a.updatedAt));

  const totalUnread = contacts.filter(c => c.unread > 0).length;
  const displayMessages = msgSearchResults !== null ? msgSearchResults : messages;

  // ── Shared input style ──────────────────────────────────────────
  const inp = {
    padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 10,
    background: T.input, color: T.inputText, fontSize: 13, outline: "none",
    width: "100%", boxSizing: "border-box", transition: "border-color 0.2s"
  };

  const card = {
    background: T.panel, borderRadius: 16, padding: 16,
    border: `1px solid ${T.border}`,
    boxShadow: D ? "none" : "0 1px 6px rgba(0,0,0,0.06)"
  };

  // ── PIPELINE ────────────────────────────────────────────────────
  const PipelineView = () => {
    const cols = ["Hot Lead","Cold Lead","Customer","VIP",""];
    return (
      <div style={{ flex:1, overflow:"hidden", padding:20, display:"flex", flexDirection:"column", background:T.bg }}>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:16, color:T.text }}>📊 Pipeline</div>
        <div style={{ display:"flex", gap:14, overflowX:"auto", flex:1, paddingBottom:8 }}>
          {cols.map(col => {
            const m = LABEL_META[col]; const cc = contacts.filter(c => c.label === col);
            return (
              <div key={col} style={{ minWidth:210, ...card, display:"flex", flexDirection:"column" }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:m.color, display:"flex", justifyContent:"space-between" }}>
                  <span>{m.icon} {col||"Untagged"}</span>
                  <span style={{ background:m.bg, padding:"2px 8px", borderRadius:20, fontSize:11 }}>{cc.length}</span>
                </div>
                <div style={{ overflowY:"auto", flex:1 }}>
                  {cc.map(c => (
                    <div key={c.phone} onClick={() => { setTab("chats"); openChat(c); }} style={{
                      background:T.bg, borderRadius:10, padding:10, marginBottom:6,
                      cursor:"pointer", border:`1px solid ${T.border}`, transition:"transform 0.1s"
                    }} className="contact-item">
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <Avatar name={c.name||c.phone} size={30} />
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{c.name||c.phone}</div>
                          <div style={{ fontSize:10, color:T.subtext }}>{c.phone}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!cc.length && <div style={{ fontSize:11, color:T.subtext, textAlign:"center", padding:16 }}>Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── DASHBOARD ───────────────────────────────────────────────────
  const Dashboard = () => (
    <div style={{ flex:1, overflowY:"auto", padding:20, background:T.bg }}>
      <div style={{ fontWeight:700, fontSize:18, marginBottom:18, color:T.text }}>📈 Dashboard</div>
      {!stats ? <div style={{ color:T.subtext, textAlign:"center", padding:60, fontSize:14 }} className="pulse">Loading stats...</div> : (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
            {[
              { icon:"👥", value:stats.totalContacts, label:"Total Contacts", color:"#6366f1" },
              { icon:"🔴", value:stats.totalUnread,   label:"Unread Chats",   color:"#ef4444" },
              { icon:"💬", value:stats.msgToday,      label:"Messages Today", color:"#3b82f6" },
              { icon:"🔥", value:stats.hotLeads,      label:"Hot Leads",      color:"#f97316" },
              { icon:"✅", value:stats.customers,     label:"Customers",      color:"#10b981" },
              { icon:"⭐", value:stats.vip,           label:"VIP",            color:"#f59e0b" },
              { icon:"📤", value:stats.sentToday,     label:"Sent Today",     color:"#8b5cf6" },
              { icon:"📥", value:stats.receivedToday, label:"Received",       color:"#06b6d4" },
            ].map((s,i) => <StatCard key={i} {...s} dark={D} />)}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>📈 Messages — Last 7 Days</div>
              <BarChart days={stats.days} dark={D} />
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>🏷️ Contact Labels</div>
              {Object.entries(stats.labels||{}).map(([l, count]) => {
                const m = LABEL_META[l]||LABEL_META[""];
                return (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <span style={{ fontSize:13, color:T.text, fontWeight:500 }}>{m.icon} {l||"None"}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, marginLeft:12 }}>
                      <div style={{ flex:1, height:6, background:T.border, borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${stats.totalContacts ? (count/stats.totalContacts)*100 : 0}%`, background:m.color, borderRadius:3, transition:"width 0.5s" }} />
                      </div>
                      <span style={{ fontSize:12, fontWeight:700, color:m.color, minWidth:24, textAlign:"right" }}>{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ── BROADCAST ───────────────────────────────────────────────────
  const Broadcast = () => (
    <div style={{ flex:1, overflowY:"auto", padding:20, background:T.bg }}>
      <div style={{ fontWeight:700, fontSize:18, marginBottom:18, color:T.text }}>📢 Broadcast</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>✍️ Message</div>
          <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Type broadcast message..." rows={7}
            style={{ ...inp, resize:"vertical", lineHeight:1.6 }} />
          <div style={{ fontSize:12, color:T.subtext, marginTop:8, fontWeight:500 }}>{broadcastSelected.length} contacts selected</div>
          {broadcastStatus && (
            <div style={{ marginTop:8, padding:"10px 14px", borderRadius:10, fontSize:13, fontWeight:600,
              background: broadcastStatus==="done" ? "#ecfdf5" : broadcastStatus==="error" ? "#fef2f2" : "#fffbeb",
              color: broadcastStatus==="done" ? "#059669" : broadcastStatus==="error" ? "#dc2626" : "#d97706"
            }}>{broadcastStatus==="done" ? "✅ Sent!" : broadcastStatus==="error" ? "❌ Failed" : "⏳ Sending..."}</div>
          )}
          <button onClick={broadcastSend} className="btn-hover" style={{
            width:"100%", marginTop:12, padding:"12px 0", background:"linear-gradient(135deg,#075E54,#10b981)",
            color:"white", border:"none", borderRadius:12, fontWeight:700, fontSize:14, cursor:"pointer",
            boxShadow:"0 4px 14px rgba(16,185,129,0.35)"
          }}>📢 Send Broadcast</button>
        </div>

        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:T.text }}>👥 Select Contacts</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
            {["","Hot Lead","Cold Lead","Customer","VIP"].map(l => {
              const m = LABEL_META[l]; const active2 = broadcastFilter===l;
              return (
                <button key={l} onClick={() => setBroadcastFilter(l)} style={{
                  padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600, border:"none", cursor:"pointer",
                  background: active2 ? (l ? m.bg : T.active) : T.input,
                  color: active2 ? (l ? m.color : T.accent) : T.subtext
                }}>{m.icon} {l||"All"}</button>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button onClick={() => setBroadcastSelected(broadcastContacts.map(c => c.phone))} style={{ flex:1, padding:"7px 0", background:T.input, border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600, color:T.text }}>All ({broadcastContacts.length})</button>
            <button onClick={() => setBroadcastSelected([])} style={{ flex:1, padding:"7px 0", background:T.input, border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600, color:T.subtext }}>Clear</button>
          </div>
          <div style={{ overflowY:"auto", maxHeight:320 }}>
            {broadcastContacts.map(c => (
              <div key={c.phone} onClick={() => setBroadcastSelected(prev => prev.includes(c.phone) ? prev.filter(p=>p!==c.phone) : [...prev,c.phone])}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:10, marginBottom:4, cursor:"pointer",
                  background:broadcastSelected.includes(c.phone) ? (D?"#1e3a2e":"#f0fdf4") : T.input,
                  border:`1.5px solid ${broadcastSelected.includes(c.phone) ? "#10b981" : T.border}`, transition:"all 0.15s" }}>
                <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${broadcastSelected.includes(c.phone)?"#10b981":T.border}`, background:broadcastSelected.includes(c.phone)?"#10b981":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {broadcastSelected.includes(c.phone) && <span style={{ color:"white", fontSize:11 }}>✓</span>}
                </div>
                <Avatar name={c.name||c.phone} size={28} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{c.name||c.phone}</div>
                  <div style={{ fontSize:10, color:T.subtext }}>{c.phone}</div>
                </div>
                <LabelPill label={c.label} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── REMINDERS ───────────────────────────────────────────────────
  const RemindersView = () => (
    <div style={{ flex:1, overflowY:"auto", padding:20, background:T.bg }}>
      <div style={{ fontWeight:700, fontSize:18, marginBottom:18, color:T.text }}>⏰ Reminders</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>➕ New Reminder</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <select value={remPhone} onChange={e => setRemPhone(e.target.value)} style={inp}>
              <option value="">Select contact...</option>
              {contacts.map(c => <option key={c.phone} value={c.phone}>{c.name||c.phone} — {c.phone}</option>)}
            </select>
            <textarea value={remMsg} onChange={e => setRemMsg(e.target.value)} placeholder="Message to send automatically..." rows={4} style={{ ...inp, resize:"vertical" }} />
            <input type="datetime-local" value={remDate} onChange={e => setRemDate(e.target.value)} style={inp} />
            <button onClick={addReminder} className="btn-hover" style={{ padding:"11px 0", background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none", borderRadius:12, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(16,185,129,0.35)" }}>
              ⏰ Set Reminder
            </button>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>📋 Upcoming ({reminders.length})</div>
          {!reminders.length && <div style={{ color:T.subtext, textAlign:"center", padding:30, fontSize:13 }}>No reminders set</div>}
          {reminders.map(r => (
            <div key={r._id} style={{ background:T.bg, borderRadius:12, padding:12, marginBottom:8, border:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{r.name||r.phone}</div>
                  <div style={{ fontSize:11, color:T.subtext, marginTop:2 }}>{r.phone}</div>
                  <div style={{ fontSize:12, color:T.text, marginTop:6, lineHeight:1.4 }}>{r.message}</div>
                  <div style={{ fontSize:11, color:"#f59e0b", marginTop:6, fontWeight:600 }}>⏰ {new Date(r.dueAt).toLocaleString("en-IN")}</div>
                </div>
                <button onClick={() => axios.delete(API+"/api/reminders/"+r._id).then(loadReminders)} style={{ background:"#fef2f2", border:"none", cursor:"pointer", color:"#ef4444", fontSize:14, padding:"4px 8px", borderRadius:8 }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── MARKETING ───────────────────────────────────────────────────
  const Marketing = () => (
    <div style={{ flex:1, overflowY:"auto", padding:20, background:T.bg }}>
      <div style={{ fontWeight:700, fontSize:18, marginBottom:18, color:T.text }}>🎯 Marketing</div>
      {mktStats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:18 }}>
          {[
            { icon:"📢", value:mktStats.total, label:"Campaigns", color:"#6366f1" },
            { icon:"✅", value:mktStats.completed, label:"Completed", color:"#10b981" },
            { icon:"⏳", value:mktStats.running, label:"Running", color:"#f59e0b" },
            { icon:"📤", value:mktStats.totalSent, label:"Total Sent", color:"#3b82f6" },
            { icon:"❌", value:mktStats.totalFailed, label:"Failed", color:"#ef4444" },
          ].map((s,i) => <StatCard key={i} {...s} dark={D} />)}
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Templates */}
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, color:T.text }}>📋 Templates</div>
            <button onClick={() => { setShowNewTemplate(true); setEditTemplate(null); setTplName(""); setTplBody(""); setTplHeader(""); setTplFooter(""); setTplWaName(""); }}
              className="btn-hover" style={{ padding:"6px 14px", background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700 }}>
              ➕ New
            </button>
          </div>
          {showNewTemplate && (
            <div style={{ background:T.bg, borderRadius:12, padding:14, marginBottom:14, border:`1px solid ${T.border}` }} className="slide-in">
              <div style={{ fontWeight:700, fontSize:13, color:T.text, marginBottom:10 }}>{editTemplate?"✏️ Edit":"➕ New"} Template</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <input placeholder="Template name" value={tplName} onChange={e => setTplName(e.target.value)} style={inp} />
                <input placeholder="Header (optional)" value={tplHeader} onChange={e => setTplHeader(e.target.value)} style={inp} />
                <textarea placeholder="Message body. Use {{name}}, {{phone}}..." value={tplBody} onChange={e => setTplBody(e.target.value)} rows={4} style={{ ...inp, resize:"vertical" }} />
                <input placeholder="Footer (optional)" value={tplFooter} onChange={e => setTplFooter(e.target.value)} style={inp} />
                <select value={tplCategory} onChange={e => setTplCategory(e.target.value)} style={inp}>
                  <option value="MARKETING">📢 Marketing</option>
                  <option value="UTILITY">🛠️ Utility</option>
                  <option value="AUTHENTICATION">🔐 Authentication</option>
                </select>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={saveTemplate} className="btn-hover" style={{ flex:1, padding:"9px 0", background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>💾 Save</button>
                  <button onClick={() => { setShowNewTemplate(false); setEditTemplate(null); }} style={{ flex:1, padding:"9px 0", background:T.input, color:T.subtext, border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", fontSize:13 }}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          <div style={{ overflowY:"auto", maxHeight:380 }}>
            {!templates.length && <div style={{ color:T.subtext, textAlign:"center", padding:24, fontSize:13 }}>No templates yet</div>}
            {templates.map(t => (
              <div key={t._id} style={{ background:T.bg, borderRadius:12, padding:12, marginBottom:8, border:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{t.name}</div>
                    <div style={{ fontSize:10, color:T.subtext, marginTop:2 }}>{t.category}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => startEditTemplate(t)} style={{ background:T.input, border:`1px solid ${T.border}`, borderRadius:8, cursor:"pointer", fontSize:12, padding:"3px 8px", color:T.subtext }}>✏️</button>
                    <button onClick={() => deleteTemplate(t._id)} style={{ background:"#fef2f2", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, padding:"3px 8px", color:"#ef4444" }}>🗑</button>
                  </div>
                </div>
                {t.header && <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>{t.header}</div>}
                <div style={{ fontSize:12, color:T.subtext, lineHeight:1.5 }}>{t.body}</div>
                <button onClick={() => { setCampMessage(t.body); setCampTemplateId(t._id); setShowNewCampaign(true); }} className="btn-hover"
                  style={{ marginTop:10, width:"100%", padding:"7px 0", background:"#ecfdf5", color:"#059669", border:"1px solid #a7f3d0", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                  📢 Use in Campaign
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Campaigns */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:14, color:T.text }}>📢 New Campaign</div>
              <button onClick={() => setShowNewCampaign(!showNewCampaign)} style={{ padding:"6px 12px", background:showNewCampaign?T.input:"linear-gradient(135deg,#075E54,#10b981)", color:showNewCampaign?T.text:"white", border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                {showNewCampaign?"✕ Close":"➕ Create"}
              </button>
            </div>
            {showNewCampaign && (
              <div className="slide-in" style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <input placeholder="Campaign name" value={campName} onChange={e => setCampName(e.target.value)} style={inp} />
                <textarea placeholder="Message... Use {{name}} for contact name" value={campMessage} onChange={e => setCampMessage(e.target.value)} rows={4} style={{ ...inp, resize:"vertical" }} />
                <select value={campLabelFilter} onChange={e => setCampLabelFilter(e.target.value)} style={inp}>
                  <option value="all">👥 All Contacts ({contacts.length})</option>
                  <option value="Hot Lead">🔥 Hot Leads ({contacts.filter(c=>c.label==="Hot Lead").length})</option>
                  <option value="Cold Lead">❄️ Cold Leads ({contacts.filter(c=>c.label==="Cold Lead").length})</option>
                  <option value="Customer">✅ Customers ({contacts.filter(c=>c.label==="Customer").length})</option>
                  <option value="VIP">⭐ VIP ({contacts.filter(c=>c.label==="VIP").length})</option>
                </select>
                {campStatus && (
                  <div style={{ padding:"10px 14px", borderRadius:10, fontSize:13, fontWeight:600,
                    background:campStatus==="done"?"#ecfdf5":campStatus==="error"?"#fef2f2":"#fffbeb",
                    color:campStatus==="done"?"#059669":campStatus==="error"?"#dc2626":"#d97706"
                  }}>{campStatus==="done"?"✅ Campaign started!":campStatus==="error"?"❌ Failed":"⏳ Sending..."}</div>
                )}
                <button onClick={sendCampaign} className="btn-hover" style={{ padding:"12px 0", background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none", borderRadius:12, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(16,185,129,0.35)" }}>
                  🚀 Launch Campaign
                </button>
              </div>
            )}
          </div>

          <div style={{ ...card, flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14, color:T.text, marginBottom:14 }}>📊 History</div>
            <div style={{ overflowY:"auto", maxHeight:340 }}>
              {!campaigns.length && <div style={{ color:T.subtext, textAlign:"center", padding:24, fontSize:13 }}>No campaigns yet</div>}
              {campaigns.map(c => (
                <div key={c._id} style={{ background:T.bg, borderRadius:12, padding:12, marginBottom:8, border:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{c.name}</div>
                      <div style={{ fontSize:10, color:T.subtext, marginTop:2 }}>{new Date(c.createdAt).toLocaleString("en-IN")}</div>
                      <div style={{ display:"flex", gap:6, marginTop:8 }}>
                        <span style={{ fontSize:11, background:"#ecfdf5", color:"#059669", padding:"2px 8px", borderRadius:8, fontWeight:600 }}>✅ {c.sentCount}</span>
                        <span style={{ fontSize:11, background:"#fef2f2", color:"#ef4444", padding:"2px 8px", borderRadius:8, fontWeight:600 }}>❌ {c.failedCount}</span>
                        <span style={{ fontSize:11, background:T.input, color:T.subtext, padding:"2px 8px", borderRadius:8, fontWeight:600 }}>📊 {c.totalCount}</span>
                      </div>
                      <div style={{ marginTop:8, height:4, background:T.border, borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${c.totalCount?(c.sentCount/c.totalCount)*100:0}%`, background:c.status==="completed"?"#10b981":"#f59e0b", borderRadius:2, transition:"width 0.5s" }} />
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:8, fontWeight:700,
                        background:c.status==="completed"?"#ecfdf5":c.status==="running"?"#fffbeb":T.input,
                        color:c.status==="completed"?"#059669":c.status==="running"?"#d97706":T.subtext
                      }}>{c.status==="completed"?"Done":c.status==="running"?"Running":c.status}</span>
                      <button onClick={() => axios.delete(API+"/api/marketing/campaigns/"+c._id).then(loadCampaigns)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontSize:14 }}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── SETTINGS ────────────────────────────────────────────────────
  const Settings = () => (
    <div style={{ flex:1, overflowY:"auto", padding:20, background:T.bg }}>
      <div style={{ fontWeight:700, fontSize:18, marginBottom:18, color:T.text }}>⚙️ Settings</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16, color:T.text }}>🎨 Appearance</div>
          {[
            { label:"🌙 Dark Mode", val:darkMode, fn:()=>setDarkMode(!darkMode) },
            { label:"🔔 Sound Notifications", val:notifSound, fn:()=>setNotifSound(!notifSound) },
          ].map(({ label, val, fn }) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontSize:14, color:T.text, fontWeight:500 }}>{label}</span>
              <Toggle value={val} onChange={fn} />
            </div>
          ))}
          <div style={{ fontSize:13, color:T.subtext, marginBottom:10, fontWeight:600 }}>🖼️ Chat Wallpaper</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {WALLPAPERS.map(w => (
              <button key={w.name} onClick={() => setWallpaper(w.value)} title={w.name} style={{
                width:40, height:40, borderRadius:12, cursor:"pointer", background:w.value,
                border: wallpaper===w.value ? `3px solid ${T.accent}` : `2px solid ${T.border}`,
                boxShadow: wallpaper===w.value ? `0 0 0 3px ${T.accent}44` : "none",
                transition:"all 0.2s"
              }} />
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16, color:T.text }}>👤 My Account</div>
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:14, background:T.bg, borderRadius:12, marginBottom:16 }}>
            <Avatar name={currentUser?.displayName||currentUser?.username||"U"} size={44} />
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:T.text }}>{currentUser?.displayName||currentUser?.username}</div>
              <div style={{ fontSize:12, color:T.subtext }}>@{currentUser?.username}</div>
              <div style={{ fontSize:11, fontWeight:700, marginTop:3, color:currentUser?.role==="admin"?"#f59e0b":"#10b981" }}>
                {currentUser?.role==="admin"?"⭐ Admin":"👤 Agent"}
              </div>
            </div>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:T.subtext, marginBottom:10 }}>🔑 Change Password</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <input type="password" placeholder="Current password" value={oldPass} onChange={e => setOldPass(e.target.value)} style={inp} />
            <input type="password" placeholder="New password (6+ chars)" value={newPass} onChange={e => setNewPass(e.target.value)} style={inp} />
            {passMsg && <div style={{ fontSize:12, fontWeight:600, color:passMsg.includes("✅")?"#059669":"#ef4444" }}>{passMsg}</div>}
            <button onClick={changePassword} className="btn-hover" style={{ padding:"10px 0", background:"#3b82f6", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>🔑 Update Password</button>
          </div>
          <button onClick={handleLogout} className="btn-hover" style={{ width:"100%", marginTop:14, padding:"11px 0", background:"#fef2f2", color:"#ef4444", border:"1.5px solid #fecaca", borderRadius:12, fontWeight:700, cursor:"pointer", fontSize:14 }}>
            🚪 Sign Out
          </button>
        </div>

        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>⌨️ Keyboard Shortcuts</div>
          {[["Ctrl + K","Search contacts"],["Ctrl + Enter","Send message"],["Enter","Send message"],["Escape","Close popups"]].map(([k,d])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontSize:13, color:T.text }}>{d}</span>
              <kbd style={{ background:T.bg, padding:"3px 10px", borderRadius:8, border:`1.5px solid ${T.border}`, fontSize:12, color:T.text, fontWeight:600 }}>{k}</kbd>
            </div>
          ))}
        </div>

        {currentUser?.role==="admin" && (
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:T.text }}>👥 Team</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
              <input placeholder="Username" value={newUserName} onChange={e => setNewUserName(e.target.value)} style={inp} />
              <input placeholder="Display Name" value={newUserDisplay} onChange={e => setNewUserDisplay(e.target.value)} style={inp} />
              <input type="password" placeholder="Password" value={newUserPass} onChange={e => setNewUserPass(e.target.value)} style={inp} />
              <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={inp}>
                <option value="agent">👤 Agent</option>
                <option value="admin">⭐ Admin</option>
              </select>
              <button onClick={addUser} className="btn-hover" style={{ padding:"10px 0", background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontWeight:700 }}>➕ Add User</button>
            </div>
            <div style={{ overflowY:"auto", maxHeight:220 }}>
              {users.map(u => (
                <div key={u._id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:T.bg, borderRadius:10, marginBottom:6, border:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <Avatar name={u.displayName||u.username} size={32} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{u.displayName||u.username}</div>
                      <div style={{ fontSize:10, color:u.role==="admin"?"#f59e0b":T.subtext, fontWeight:600 }}>@{u.username} · {u.role}</div>
                    </div>
                  </div>
                  {u.username!==currentUser?.username && (
                    <button onClick={async()=>{if(!window.confirm("Delete?"))return;await axios.delete(API+"/auth/users/"+u._id);loadUsers();}} style={{ background:"#fef2f2", border:"none", borderRadius:8, cursor:"pointer", color:"#ef4444", padding:"5px 10px", fontSize:13 }}>🗑</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── AUTH GATE ────────────────────────────────────────────────────
  if (!authChecked) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#0f172a,#1e3a5f)", color:"white" }}>
      <div style={{ fontSize:32, animation:"spin 1s linear infinite" }}>⏳</div>
    </div>
  );
  if (!currentUser) return <LoginPage onLogin={handleLogin} />;

  const TABS = [
    { id:"chats",     icon:"💬", label:"Chats" },
    { id:"contacts",  icon:"👥", label:"Contacts" },
    { id:"broadcast", icon:"📢", label:"Broadcast" },
    { id:"reminders", icon:"⏰", label:"Reminders" },
    { id:"pipeline",  icon:"📊", label:"Pipeline" },
    { id:"dashboard", icon:"📈", label:"Stats" },
    { id:"marketing", icon:"🎯", label:"Marketing" },
  ];

  // ── MAIN RENDER ──────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"DM Sans, sans-serif", background:T.bg, overflow:"hidden" }}>

      {/* ═══ LEFT SIDEBAR ═══════════════════════════════════════════ */}
      {(!isMobile || showSidebar) && (
        <div style={{ width:isMobile?"100%":"320px", display:"flex", flexDirection:"column", background:T.sidebar, borderRight:`1px solid ${T.border}`, boxShadow:D?"none":"2px 0 16px rgba(0,0,0,0.06)", zIndex:10 }}>

          {/* Header */}
          <div style={{ padding:"14px 16px", background:D?"#0f172a":"white", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:12, background:"linear-gradient(135deg,#075E54,#10b981)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>📱</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, color:T.text, letterSpacing:"-0.3px" }}>WhatsApp CRM</div>
                  <div style={{ fontSize:11, color:T.accent, fontWeight:600 }}>{currentUser?.displayName||currentUser?.username}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>setDarkMode(!darkMode)} style={{ background:T.input, border:`1px solid ${T.border}`, borderRadius:10, width:32, height:32, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>{D?"☀️":"🌙"}</button>
                <button onClick={()=>setTab("settings")} style={{ background:T.input, border:`1px solid ${T.border}`, borderRadius:10, width:32, height:32, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>⚙️</button>
              </div>
            </div>

            {/* Mini stats */}
            <div style={{ display:"flex", gap:6 }}>
              {[
                { label:`${contacts.length} contacts`, color:T.subtext },
                { label:`${totalUnread} unread`, color:totalUnread?T.accent:T.subtext, click:()=>setUnreadFilter(!unreadFilter) },
                { label:`${contacts.filter(c=>c.label==="Hot Lead").length} hot`, color:"#f97316" },
              ].map((s,i) => (
                <button key={i} onClick={s.click} style={{ background:T.input, border:`1px solid ${T.border}`, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600, color:s.color, cursor:s.click?"pointer":"default" }}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", overflowX:"auto", borderBottom:`1px solid ${T.border}`, padding:"0 4px" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)} title={t.label} className="tab-btn" style={{
                flex:"0 0 auto", padding:"10px 10px 8px", border:"none", background:"none",
                borderBottom: tab===t.id ? `2.5px solid ${T.accent}` : "2.5px solid transparent",
                cursor:"pointer", fontSize:18, color: tab===t.id ? T.accent : T.subtext,
                display:"flex", flexDirection:"column", alignItems:"center", gap:2
              }}>
                {t.icon}
                <span style={{ fontSize:9, fontWeight:tab===t.id?700:500 }}>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Contacts tab form */}
          {tab === "contacts" && (
            <div style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, background:D?"#1e293b":"#f8fafc" }}>
              <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                <input placeholder="Name" value={newName} onChange={e=>setNewName(e.target.value)} style={{ ...inp, flex:1 }} />
                <input placeholder="Phone" value={newPhone} onChange={e=>setNewPhone(e.target.value)} style={{ ...inp, flex:1 }} />
                <button onClick={async()=>{ if(!newPhone)return alert("Enter phone"); try{await axios.post(API+"/api/add-contact",{name:newName,phone:newPhone});setNewName("");setNewPhone("");loadContacts();}catch(e){alert(e.response?.data?.error||"Error");}}}
                  style={{ padding:"9px 12px", background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontWeight:700 }}>➕</button>
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                <label style={{ flex:1, padding:"8px 0", background:T.input, border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", fontSize:12, color:T.text, textAlign:"center", fontWeight:600 }}>
                  📂 Import CSV
                  <input type="file" accept=".csv" style={{ display:"none" }} onChange={async e=>{
                    const file=e.target.files[0]; if(!file)return;
                    const fd=new FormData(); fd.append("file",file);
                    setCsvProgress({current:0,total:0,percent:0,added:0,skipped:0});
                    try{ const res=await axios.post(API+"/api/upload-csv",fd); setCsvProgress({...res.data,percent:100,done:true}); loadContacts(); setTimeout(()=>setCsvProgress(null),4000); }
                    catch{ setCsvProgress(null); alert("Upload failed"); }
                  }} />
                </label>
                <button onClick={exportCSV} style={{ flex:1, padding:"8px 0", background:"#ecfdf5", color:"#059669", border:"1.5px solid #a7f3d0", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700 }}>📥 Export</button>
                <button onClick={()=>{ setBulkSelectMode(!bulkSelectMode); setBulkSelected([]); }} style={{ flex:1, padding:"8px 0", background:bulkSelectMode?"#fef2f2":T.input, color:bulkSelectMode?"#ef4444":T.subtext, border:`1.5px solid ${bulkSelectMode?"#fecaca":T.border}`, borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                  {bulkSelectMode?"✕ Cancel":"☑️ Select"}
                </button>
              </div>

              {csvProgress && (
                <div style={{ marginBottom:6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.subtext, marginBottom:4, fontWeight:600 }}>
                    <span>{csvProgress.done?"✅ Done!":"⏳ Importing..."}</span>
                    <span>+{csvProgress.added} added · {csvProgress.skipped} skipped</span>
                  </div>
                  <div style={{ height:6, background:T.border, borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${csvProgress.percent}%`, background:csvProgress.done?"#10b981":"linear-gradient(90deg,#10b981,#34d399)", borderRadius:3, transition:"width 0.3s" }} />
                  </div>
                </div>
              )}

              {bulkSelectMode && bulkSelected.length > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#fef2f2", borderRadius:10, border:"1.5px solid #fecaca" }}>
                  <span style={{ fontSize:13, color:"#ef4444", fontWeight:700 }}>{bulkSelected.length} selected</span>
                  <button onClick={bulkDelete} style={{ padding:"5px 14px", background:"#ef4444", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 }}>🗑 Delete</button>
                </div>
              )}
            </div>
          )}

          {/* Label filter */}
          {(tab==="chats"||tab==="contacts") && (
            <div style={{ padding:"8px 12px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:`1px solid ${T.border}` }}>
              {["","Hot Lead","Cold Lead","Customer","VIP"].map(l => {
                const m = LABEL_META[l]; const active2 = labelFilter===l;
                return (
                  <button key={l} onClick={()=>setLabelFilter(l===labelFilter?"":l)} style={{
                    padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, border:"none", cursor:"pointer",
                    background: active2 ? (l ? m.bg : T.active) : T.input,
                    color: active2 ? (l ? m.color : T.accent) : T.subtext,
                    transition:"all 0.15s"
                  }}>{m.icon} {l||"All"}</button>
                );
              })}
            </div>
          )}

          {/* Search */}
          {(tab==="chats"||tab==="contacts") && (
            <div style={{ padding:"8px 12px" }}>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:T.subtext }}>🔍</span>
                <input id="cs" placeholder="Search... (Ctrl+K)" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{ ...inp, paddingLeft:34 }} />
              </div>
            </div>
          )}

          {/* Contact List */}
          {(tab==="chats"||tab==="contacts") && (
            <div style={{ overflowY:"auto", flex:1 }}>
              {!filtered.length && (
                <div style={{ textAlign:"center", color:T.subtext, padding:32, fontSize:13 }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>🔍</div>
                  No contacts found
                </div>
              )}
              {filtered.map(c => (
                <div key={c.phone} className="contact-item"
                  onClick={()=>{ if(bulkSelectMode){ setBulkSelected(prev=>prev.includes(c.phone)?prev.filter(p=>p!==c.phone):[...prev,c.phone]); } else { openChat(c); if(tab!=="chats")setTab("chats"); } }}
                  style={{
                    padding:"10px 14px", cursor:"pointer",
                    background: bulkSelected.includes(c.phone) ? (D?"#1e3a2e":"#f0fdf4") : active===c.phone ? T.active : T.sidebar,
                    borderBottom:`1px solid ${T.border}`,
                    borderLeft:`3px solid ${bulkSelected.includes(c.phone)||active===c.phone ? T.accent : "transparent"}`,
                  }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {bulkSelectMode && (
                      <div style={{ width:18,height:18,borderRadius:5,border:`2px solid ${bulkSelected.includes(c.phone)?T.accent:T.border}`,background:bulkSelected.includes(c.phone)?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        {bulkSelected.includes(c.phone)&&<span style={{color:"white",fontSize:11}}>✓</span>}
                      </div>
                    )}
                    <div style={{ position:"relative" }}>
                      <Avatar name={c.name||c.phone} size={42} />
                      {c.pinned && <div style={{ position:"absolute",bottom:-2,right:-2,fontSize:10,background:"white",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.2)" }}>📌</div>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {c.name||c.phone}
                      </div>
                      <div style={{ fontSize:11, color:T.subtext, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:2 }}>
                        {c.lastMessage||"No messages yet"}
                      </div>
                    </div>
                    {!bulkSelectMode && (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                        <Badge count={c.unread} />
                        <LabelPill label={c.label} />
                        <div style={{ display:"flex", gap:2, opacity:0 }} className="contact-actions">
                          <button onClick={e=>togglePin(c.phone,e)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:c.pinned?"#f59e0b":T.subtext }}>📌</button>
                          <button onClick={async e=>{ e.stopPropagation(); if(!window.confirm("Delete?"))return; await axios.delete(API+"/api/delete-contact/"+c.phone); if(active===c.phone){setActive(null);setActiveContact(null);} loadContacts(); }} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#ef4444" }}>🗑</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ MAIN CONTENT ════════════════════════════════════════════ */}
      {(!isMobile || !showSidebar) && (
        tab==="chats" ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

            {/* Chat Header */}
            <div style={{ padding:"12px 18px", background:T.header, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:D?"none":"0 1px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {isMobile && (
                  <button onClick={()=>setShowSidebar(true)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:T.text, marginRight:4 }}>←</button>
                )}
                {activeContact ? (
                  <>
                    <div style={{ position:"relative" }}>
                      <Avatar name={activeContact.name||activeContact.phone} size={40} />
                      <div style={{ position:"absolute", bottom:1, right:1, width:10, height:10, borderRadius:"50%", background:"#10b981", border:`2px solid ${T.header}` }} />
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:T.text, letterSpacing:"-0.2px" }}>
                        {activeContact.name||activeContact.phone}
                      </div>
                      <div style={{ fontSize:11, color:T.subtext, fontWeight:500 }}>
                        {activeContact.name ? activeContact.phone : ""}
                        {typing && <span style={{ color:T.accent }} className="pulse"> · typing...</span>}
                      </div>
                    </div>
                    {activeContact.label && <LabelPill label={activeContact.label} size="md" />}
                  </>
                ) : (
                  <div style={{ color:T.subtext, fontSize:14 }}>Select a conversation</div>
                )}
              </div>

              {activeContact && (
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>setShowMsgSearch(!showMsgSearch)} style={{ background:showMsgSearch?T.accent:T.input, color:showMsgSearch?"white":T.subtext, border:`1px solid ${T.border}`, borderRadius:10, width:36, height:36, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>🔍</button>
                  <button onClick={()=>setShowProfile(!showProfile)} style={{ background:showProfile?T.accent:T.input, color:showProfile?"white":T.subtext, border:`1px solid ${T.border}`, borderRadius:10, width:36, height:36, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>👤</button>
                </div>
              )}
            </div>

            {/* Message search */}
            {showMsgSearch && active && (
              <div style={{ padding:"8px 14px", background:T.input, borderBottom:`1px solid ${T.border}`, display:"flex", gap:8 }} className="slide-in">
                <input placeholder="Search in this chat..." value={msgSearch} onChange={e=>{ setMsgSearch(e.target.value); if(!e.target.value)setMsgSearchResults(null); }} onKeyDown={e=>e.key==="Enter"&&searchMessages()}
                  style={{ ...inp, flex:1 }} />
                <button onClick={searchMessages} style={{ padding:"8px 16px", background:T.accent, color:"white", border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>Search</button>
                {msgSearchResults!==null && <button onClick={()=>{setMsgSearchResults(null);setMsgSearch("");}} style={{ padding:"8px 12px", background:T.input, border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", fontSize:12, color:T.subtext }}>Clear ({msgSearchResults.length})</button>}
              </div>
            )}

            <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
              {/* Messages */}
              <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
                <div style={{ flex:1, padding:"12px 14px", overflowY:"auto", background:T.chatbg, display:"flex", flexDirection:"column" }}>

                  {!active && (
                    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"rgba(0,0,0,0.3)" }}>
                      <div style={{ width:80, height:80, borderRadius:24, background:"linear-gradient(135deg,#075E54,#10b981)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:40, marginBottom:16, boxShadow:"0 12px 32px rgba(16,185,129,0.3)" }}>💬</div>
                      <div style={{ fontSize:18, fontWeight:700, color:"rgba(0,0,0,0.5)", marginBottom:6 }}>Select a chat</div>
                      <div style={{ fontSize:13, color:"rgba(0,0,0,0.3)" }}>Ctrl+K to search contacts</div>
                    </div>
                  )}

                  {displayMessages.map((m,i) => {
                    const curr = m.createdAt ? new Date(m.createdAt).toDateString() : null;
                    const prev = i>0&&displayMessages[i-1].createdAt ? new Date(displayMessages[i-1].createdAt).toDateString() : null;
                    const isOut = m.direction==="outgoing";
                    return (
                      <div key={i} style={{ display:"flex", flexDirection:"column" }}>
                        {curr && curr!==prev && (
                          <div style={{ textAlign:"center", margin:"12px 0", fontSize:11 }}>
                            <span style={{ background:"rgba(255,255,255,0.7)", backdropFilter:"blur(8px)", color:"#64748b", padding:"3px 14px", borderRadius:20, fontWeight:600, boxShadow:"0 1px 4px rgba(0,0,0,0.08)" }}>
                              {fmtDate(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className="msg-bubble" style={{
                          maxWidth:"60%", padding:"9px 13px", margin:"2px 6px",
                          borderRadius: isOut?"18px 18px 4px 18px":"18px 18px 18px 4px",
                          background: isOut?T.outgoing:T.incoming,
                          alignSelf: isOut?"flex-end":"flex-start",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                          color: isOut?T.outText:T.inText
                        }}>
                          {m.media ? (
                            m.mimeType?.startsWith("image") ? <img src={API+"/uploads/"+m.message} width="200" style={{ borderRadius:12 }} alt="img" /> :
                            m.mimeType?.startsWith("audio") ? <audio controls src={API+"/uploads/"+m.message} style={{ width:200 }} /> :
                            m.mimeType?.startsWith("video") ? <video controls src={API+"/uploads/"+m.message} width="200" style={{ borderRadius:12 }} /> :
                            <a href={API+"/uploads/"+m.message} target="_blank" rel="noreferrer" style={{ color:T.accent, fontWeight:600 }}>📎 View File</a>
                          ) : <div style={{ fontSize:14, lineHeight:1.5 }}>{m.message}</div>}
                          <div style={{ fontSize:10, color: isOut?"rgba(255,255,255,0.6)":"rgba(0,0,0,0.35)", textAlign:"right", marginTop:3, fontWeight:500 }}>
                            {fmtTime(m.createdAt)}{isOut ? (m.status==="seen"?" ✔✔":" ✔") : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Input Area */}
                {active && (
                  <div style={{ background:T.panel, borderTop:`1px solid ${T.border}` }}>
                    {showQuickReplies && (
                      <div style={{ padding:"10px 14px", background:T.input, borderTop:`1px solid ${T.border}` }} className="slide-in">
                        <div style={{ fontSize:11, color:T.subtext, marginBottom:6, fontWeight:700 }}>⚡ Quick Replies</div>
                        {QUICK_REPLIES.map((qr,i) => (
                          <div key={i} onClick={()=>sendMsg(qr)} style={{ padding:"8px 12px", background:T.panel, borderRadius:10, marginBottom:4, cursor:"pointer", fontSize:13, border:`1px solid ${T.border}`, color:T.text, transition:"background 0.15s" }} className="contact-item">{qr}</div>
                        ))}
                      </div>
                    )}
                    {showEmojiPicker && (
                      <div style={{ padding:"10px 14px", background:T.input, borderTop:`1px solid ${T.border}`, display:"flex", flexWrap:"wrap", gap:4 }} className="slide-in">
                        {EMOJI_LIST.map(e => (
                          <button key={e} onClick={()=>setText(prev=>prev+e)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", padding:"3px 4px", borderRadius:8, lineHeight:1 }}>{e}</button>
                        ))}
                      </div>
                    )}
                    <div style={{ display:"flex", padding:"10px 14px", gap:8, alignItems:"center" }}>
                      <button onClick={()=>{ setShowEmojiPicker(!showEmojiPicker); setShowQuickReplies(false); }} style={{ background:showEmojiPicker?T.accent:T.input, color:showEmojiPicker?"white":T.subtext, border:`1px solid ${T.border}`, borderRadius:12, padding:"8px 10px", cursor:"pointer", fontSize:18, transition:"all 0.2s" }}>😊</button>
                      <button onClick={()=>{ setShowQuickReplies(!showQuickReplies); setShowEmojiPicker(false); }} style={{ background:showQuickReplies?T.accent:T.input, color:showQuickReplies?"white":T.subtext, border:`1px solid ${T.border}`, borderRadius:12, padding:"8px 10px", cursor:"pointer", fontSize:18, transition:"all 0.2s" }}>⚡</button>
                      <label style={{ background:T.input, border:`1px solid ${T.border}`, borderRadius:12, padding:"8px 10px", cursor:"pointer", fontSize:18, color:T.subtext }}>
                        📎<input type="file" style={{ display:"none" }} onChange={sendFile} />
                      </label>
                      <input value={text}
                        onChange={e=>{ setText(e.target.value); socket.emit("typing",active); clearTimeout(typingTimeout.current); typingTimeout.current=setTimeout(()=>socket.emit("stop_typing",active),1000); }}
                        onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();} }}
                        placeholder="Type a message..."
                        style={{ flex:1, padding:"11px 16px", borderRadius:20, border:`1.5px solid ${T.border}`, fontSize:14, outline:"none", background:T.input, color:T.inputText, transition:"border-color 0.2s" }} />
                      <button onClick={()=>sendMsg()} className="btn-hover" style={{
                        background:"linear-gradient(135deg,#075E54,#10b981)", color:"white", border:"none",
                        borderRadius:"50%", width:44, height:44, cursor:"pointer", fontSize:18,
                        boxShadow:"0 4px 14px rgba(16,185,129,0.4)", display:"flex", alignItems:"center", justifyContent:"center"
                      }}>➤</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Panel */}
              {showProfile && activeContact && (
                <div style={{ width:260, background:T.panel, borderLeft:`1px solid ${T.border}`, overflowY:"auto" }} className="slide-in">
                  <div style={{ padding:20, background:`linear-gradient(135deg, ${getAvatarColor(activeContact.name||activeContact.phone)}, ${getAvatarColor(activeContact.phone)})`, textAlign:"center" }}>
                    <Avatar name={activeContact.name||activeContact.phone} size={64} style={{ margin:"0 auto 10px", boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }} />
                    <div style={{ fontWeight:700, fontSize:16, color:"white" }}>{activeContact.name||"No Name"}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", marginTop:3 }}>{activeContact.phone}</div>
                  </div>
                  <div style={{ padding:16 }}>
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:T.subtext, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.5px" }}>Label</div>
                      <select value={activeContact.label||""} onChange={e=>updateLabel(activeContact.phone,e.target.value)} style={inp}>
                        <option value="">None</option>
                        <option value="Hot Lead">🔥 Hot Lead</option>
                        <option value="Cold Lead">❄️ Cold Lead</option>
                        <option value="Customer">✅ Customer</option>
                        <option value="VIP">⭐ VIP</option>
                      </select>
                    </div>
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:T.subtext, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.5px" }}>Notes</div>
                      <textarea value={notesText} onChange={e=>{setNotesText(e.target.value);setNotesSaved(false);}} placeholder="Add notes..." rows={5}
                        style={{ ...inp, resize:"vertical" }} />
                      <button onClick={saveNotes} className="btn-hover" style={{ width:"100%", padding:"9px 0", marginTop:8, background:notesSaved?"#ecfdf5":"linear-gradient(135deg,#075E54,#10b981)", color:notesSaved?"#059669":"white", border:notesSaved?"1.5px solid #a7f3d0":"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                        {notesSaved?"✅ Saved!":"💾 Save Notes"}
                      </button>
                    </div>
                    <div style={{ fontSize:12, color:T.subtext }}>
                      <div style={{ marginBottom:6 }}>📅 Added: {activeContact.createdAt ? new Date(activeContact.createdAt).toLocaleDateString("en-IN") : "—"}</div>
                      <div>📌 {activeContact.pinned?"Pinned":"Not pinned"}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : tab==="dashboard" ? <Dashboard /> :
          tab==="broadcast" ? <Broadcast /> :
          tab==="reminders" ? <RemindersView /> :
          tab==="pipeline"  ? <PipelineView /> :
          tab==="marketing" ? <Marketing /> :
          tab==="settings"  ? <Settings /> : null
      )}
    </div>
  );
}
