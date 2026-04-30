import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = process.env.REACT_APP_API;

const LABEL_COLORS = {
  "Hot Lead": "#FF6B6B",
  "Cold Lead": "#74C0FC",
  "Customer": "#51CF66",
  "VIP": "#FAB005",
  "": "#aaa"
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
  { name: "Default", value: "#ECE5DD" },
  { name: "Dark", value: "#0b141a" },
  { name: "Blue", value: "#e8f4fd" },
  { name: "Green", value: "#e8f8f0" },
  { name: "Purple", value: "#f3e8fd" },
  { name: "Pattern", value: "repeating-linear-gradient(45deg, #e8e0d4 0px, #e8e0d4 2px, #f0ece4 2px, #f0ece4 10px)" }
];

// ===== MINI BAR CHART =====
const BarChart = ({ days, T }) => {
  const max = Math.max(...days.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {days.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ fontSize: 9, color: T.subtext }}>{d.count}</div>
          <div style={{ width: "100%", background: "#25D366", borderRadius: "4px 4px 0 0", height: `${(d.count / max) * 60}px`, minHeight: d.count ? 4 : 0 }} />
          <div style={{ fontSize: 9, color: T.subtext }}>{d.date}</div>
        </div>
      ))}
    </div>
  );
};

// ===== LOGIN PAGE =====
const LoginPage = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await axios.post(API + "/auth/login", { username, password });
      localStorage.setItem("crm_token", res.data.token);
      localStorage.setItem("crm_user", JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data || "Login failed");
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    setError(""); setLoading(true);
    try {
      await axios.post(API + "/auth/register", { username, password, displayName });
      setMode("login");
      setError("✅ Account created! Login करा.");
    } catch (err) {
      setError(err.response?.data || "Register failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100vh", background: "linear-gradient(135deg, #075E54 0%, #128C7E 50%, #25D366 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "white", borderRadius: 20, padding: 36, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📱</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: "#075E54" }}>WhatsApp CRM</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>by Somsai</div>
        </div>

        {/* Toggle */}
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
              flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer",
              background: mode === m ? "white" : "transparent",
              fontWeight: mode === m ? "bold" : "normal",
              color: mode === m ? "#075E54" : "#888",
              boxShadow: mode === m ? "0 2px 6px rgba(0,0,0,0.1)" : "none",
              fontSize: 13, textTransform: "capitalize"
            }}>{m === "login" ? "🔐 Login" : "➕ Register"}</button>
          ))}
        </div>

        {/* Fields */}
        {mode === "register" && (
          <input placeholder="Display Name (optional)" value={displayName} onChange={e => setDisplayName(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
        )}

        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />

        <input type="password" placeholder="Password (6+ chars)" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, marginBottom: 16, boxSizing: "border-box", outline: "none" }} />

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13,
            background: error.includes("✅") ? "#e8f8f0" : "#fff0f0",
            color: error.includes("✅") ? "#25D366" : "#e74c3c",
            border: `1px solid ${error.includes("✅") ? "#25D366" : "#ffcdd2"}`
          }}>{error}</div>
        )}

        <button onClick={mode === "login" ? handleLogin : handleRegister} disabled={loading} style={{
          width: "100%", padding: "13px 0", background: loading ? "#ccc" : "linear-gradient(135deg, #075E54, #25D366)",
          color: "white", border: "none", borderRadius: 10, cursor: loading ? "default" : "pointer",
          fontWeight: "bold", fontSize: 15, boxShadow: "0 4px 14px rgba(7,94,84,0.3)"
        }}>
          {loading ? "⏳ Please wait..." : mode === "login" ? "🔐 Login" : "➕ Create Account"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "#aaa", marginTop: 16 }}>
          First user automatically becomes Admin
        </div>
      </div>
    </div>
  );
};

// ===== MAIN APP =====
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Core states
  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState(null);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState("chats");

  // Contact mgmt
  const [uploadMsg, setUploadMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // UI states
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("crm_dark") === "true");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem("crm_wallpaper") || "#ECE5DD");
  const [showSettings, setShowSettings] = useState(false);
  const [notifSound, setNotifSound] = useState(() => localStorage.getItem("crm_sound") !== "false");
  const [msgSearch, setMsgSearch] = useState("");
  const [msgSearchResults, setMsgSearchResults] = useState(null);
  const [showMsgSearch, setShowMsgSearch] = useState(false);

  // Phase 2
  const [stats, setStats] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastFilter, setBroadcastFilter] = useState("");
  const [broadcastSelected, setBroadcastSelected] = useState([]);
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const [reminders, setReminders] = useState([]);
  const [remPhone, setRemPhone] = useState("");
  const [remMsg, setRemMsg] = useState("");
  const [remDate, setRemDate] = useState("");

  // Auth - Users management
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
  const audioRef = useRef(null);

  // Theme
  const T = {
    bg: darkMode ? "#111b21" : "#f0f2f5",
    panel: darkMode ? "#202c33" : "white",
    sidebar: darkMode ? "#111b21" : "white",
    border: darkMode ? "#2a3942" : "#e8e8e8",
    text: darkMode ? "#e9edef" : "#111",
    subtext: darkMode ? "#8696a0" : "#888",
    chatbg: wallpaper,
    outgoing: darkMode ? "#005c4b" : "#DCF8C6",
    incoming: darkMode ? "#202c33" : "white",
    input: darkMode ? "#2a3942" : "#f5f5f5",
    inputText: darkMode ? "#e9edef" : "#111",
    active: darkMode ? "#2a3942" : "#f0f7f0",
    header: "#075E54"
  };

  // ===== AUTH CHECK =====
  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    const user = localStorage.getItem("crm_user");
    if (token && user) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      setCurrentUser(JSON.parse(user));
    }
    setAuthChecked(true);
  }, []);

  const handleLogin = (user) => {
    const token = localStorage.getItem("crm_token");
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    delete axios.defaults.headers.common["Authorization"];
    setCurrentUser(null);
    setActive(null);
    setContacts([]);
    setMessages([]);
  };

  // Notification sound
  const playSound = useCallback(() => {
    if (!notifSound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }, [notifSound]);

  // Browser notification
  const showBrowserNotif = useCallback((title, body) => {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" });
    }
  }, []);

  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const getToken = () => localStorage.getItem("crm_token");

  const loadContacts = async () => {
    try {
      const res = await axios.get(API + "/api/contacts");
      setContacts(res.data);
    } catch (err) { console.log("Contacts error:", err); }
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

  useEffect(() => {
    if (currentUser) { loadContacts(); loadReminders(); }
  }, [currentUser]);

  useEffect(() => {
    if (tab === "dashboard") loadStats();
    if (tab === "settings" && currentUser?.role === "admin") loadUsers();
  }, [tab]);

  useEffect(() => {
    localStorage.setItem("crm_dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("crm_wallpaper", wallpaper);
  }, [wallpaper]);

  useEffect(() => {
    localStorage.setItem("crm_sound", notifSound);
  }, [notifSound]);

  const openChat = async (contact) => {
    setActive(contact.phone);
    setActiveContact(contact);
    setNotesText(contact.notes || "");
    setNotesSaved(false);
    setShowProfile(false);
    setShowMsgSearch(false);
    setMsgSearch(""); setMsgSearchResults(null);
    setShowEmojiPicker(false);
    setShowQuickReplies(false);
    const res = await axios.get(API + "/api/messages/" + contact.phone);
    setMessages(res.data);
    await axios.post(API + "/api/seen/" + contact.phone);
    socket.emit("join", contact.phone);
    setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, unread: 0 } : c));
  };

  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => {
        if (msg.phone === active) {
          playSound();
          return [...prev, msg];
        }
        return prev;
      });
      loadContacts();
      if (msg.direction === "incoming") {
        const c = contacts.find(c => c.phone === msg.phone);
        showBrowserNotif(c?.name || msg.phone, msg.message);
        if (msg.phone !== active) playSound();
      }
    });
    socket.on("typing", (phone) => { if (phone === active) setTyping(true); });
    socket.on("stop_typing", (phone) => { if (phone === active) setTyping(false); });
    socket.on("message_status", ({ phone, status }) => {
      setMessages(prev => prev.map(m => m.phone === phone ? { ...m, status } : m));
    });
    socket.on("reminder_sent", ({ id }) => {
      setReminders(prev => prev.filter(r => r._id !== id));
    });
    return () => {
      socket.off("new_message");
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("message_status");
      socket.off("reminder_sent");
    };
  }, [active, contacts, playSound, showBrowserNotif]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === "k") { e.preventDefault(); document.querySelector("#contact-search")?.focus(); }
      if (e.key === "Escape") { setShowEmojiPicker(false); setShowQuickReplies(false); }
      if (e.ctrlKey && e.key === "Enter") { if (active) sendMsg(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, text]);

  const formatTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateDivider = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN");
  };

  const sendMsg = async (msgText) => {
    const msg = (msgText || text).trim();
    if (!active || !msg) return;
    await axios.post(API + "/api/send", { phone: active, message: msg });
    setMessages(prev => [...prev, { phone: active, message: msg, direction: "outgoing", status: "sent", createdAt: new Date() }]);
    setText("");
    setShowQuickReplies(false);
    setShowEmojiPicker(false);
    socket.emit("stop_typing", active);
  };

  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !active) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("phone", active);
    await axios.post(API + "/api/send/media", formData);
    e.target.value = "";
  };

  const updateLabel = async (phone, label) => {
    await axios.post(API + "/api/label/" + phone, { label });
    setContacts(prev => prev.map(c => c.phone === phone ? { ...c, label } : c));
    if (activeContact?.phone === phone) setActiveContact(prev => ({ ...prev, label }));
  };

  const saveNotes = async () => {
    await axios.post(API + "/api/notes/" + active, { notes: notesText });
    setContacts(prev => prev.map(c => c.phone === active ? { ...c, notes: notesText } : c));
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const togglePin = async (phone, e) => {
    e.stopPropagation();
    const res = await axios.post(API + "/api/pin/" + phone);
    loadContacts();
  };

  const searchMessages = async () => {
    if (!msgSearch.trim() || !active) return;
    const res = await axios.get(API + "/api/search-messages/" + active + "?q=" + msgSearch);
    setMsgSearchResults(res.data);
  };

  const broadcastSend = async () => {
    if (!broadcastMsg.trim() || !broadcastSelected.length) return alert("Message aur contacts select karo");
    setBroadcastStatus(`⏳ Sending to ${broadcastSelected.length} contacts...`);
    try {
      await axios.post(API + "/api/broadcast", { phones: broadcastSelected, message: broadcastMsg });
      setBroadcastStatus(`✅ Sent to ${broadcastSelected.length} contacts!`);
      setBroadcastSelected([]); setBroadcastMsg("");
    } catch { setBroadcastStatus("❌ Broadcast failed"); }
  };

  const addReminder = async () => {
    if (!remPhone || !remMsg || !remDate) return alert("Fill all fields");
    const contact = contacts.find(c => c.phone === remPhone);
    await axios.post(API + "/api/reminders", { phone: remPhone, name: contact?.name || remPhone, message: remMsg, dueAt: remDate });
    setRemPhone(""); setRemMsg(""); setRemDate("");
    loadReminders();
  };

  const exportCSV = () => window.open(API + "/api/export-csv", "_blank");

  const addUser = async () => {
    if (!newUserName || !newUserPass) return alert("Fill all fields");
    try {
      await axios.post(API + "/auth/register", { username: newUserName, password: newUserPass, displayName: newUserDisplay, role: newUserRole });
      setNewUserName(""); setNewUserPass(""); setNewUserDisplay(""); setNewUserRole("agent");
      loadUsers();
    } catch (err) { alert(err.response?.data || "Error"); }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    await axios.delete(API + "/auth/users/" + id);
    loadUsers();
  };

  const changePassword = async () => {
    if (!oldPass || !newPass) return;
    try {
      await axios.post(API + "/auth/change-password", { username: currentUser.username, oldPassword: oldPass, newPassword: newPass });
      setPassMsg("✅ Password changed!"); setOldPass(""); setNewPass("");
      setTimeout(() => setPassMsg(""), 3000);
    } catch (err) { setPassMsg("❌ " + (err.response?.data || "Error")); }
  };

  const broadcastContacts = contacts.filter(c => !broadcastFilter || c.label === broadcastFilter);

  const filtered = contacts
    .filter(c => tab === "chats" ? c.lastMessage : true)
    .filter(c => !labelFilter || c.label === labelFilter)
    .filter(c => !unreadFilter || c.unread > 0)
    .filter(c =>
      c.phone.includes(search) ||
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.lastMessage || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt));

  const totalUnread = contacts.filter(c => c.unread > 0).length;
  const displayMessages = msgSearchResults !== null ? msgSearchResults : messages;

  // ===== PIPELINE =====
  const PipelineView = () => {
    const columns = ["Hot Lead", "Cold Lead", "Customer", "VIP", ""];
    const colNames = { "Hot Lead": "🔥 Hot Lead", "Cold Lead": "❄️ Cold Lead", "Customer": "✅ Customer", "VIP": "⭐ VIP", "": "📋 Untagged" };
    return (
      <div style={{ flex: 1, overflow: "hidden", padding: 16, display: "flex", flexDirection: "column", background: T.bg }}>
        <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 12, color: T.text }}>📊 Pipeline View</div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", flex: 1 }}>
          {columns.map(col => {
            const col_contacts = contacts.filter(c => c.label === col);
            return (
              <div key={col} style={{ minWidth: 200, background: T.panel, borderRadius: 12, padding: 12, border: `1px solid ${T.border}` }}>
                <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8, color: col ? LABEL_COLORS[col] : T.subtext }}>
                  {colNames[col]} ({col_contacts.length})
                </div>
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 200px)" }}>
                  {col_contacts.map(c => (
                    <div key={c.phone} onClick={() => { setTab("chats"); openChat(c); }}
                      style={{ background: T.bg, borderRadius: 8, padding: 10, marginBottom: 6, cursor: "pointer", border: `1px solid ${T.border}` }}>
                      <div style={{ fontWeight: "600", fontSize: 12, color: T.text }}>{c.name || c.phone}</div>
                      <div style={{ fontSize: 10, color: T.subtext, marginTop: 2 }}>{c.phone}</div>
                    </div>
                  ))}
                  {!col_contacts.length && <div style={{ fontSize: 11, color: T.subtext, textAlign: "center", padding: 8 }}>Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ===== DASHBOARD =====
  const Dashboard = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: T.bg }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: T.text }}>📈 Dashboard</div>
      {!stats ? (
        <div style={{ color: T.subtext, textAlign: "center", padding: 40 }}>Loading...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Contacts", value: stats.totalContacts, icon: "👥", color: "#075E54" },
              { label: "Unread", value: stats.totalUnread, icon: "🔴", color: "#e74c3c" },
              { label: "Today", value: stats.msgToday, icon: "💬", color: "#3498db" },
              { label: "Hot Leads", value: stats.hotLeads, icon: "🔥", color: "#FF6B6B" },
              { label: "Customers", value: stats.customers, icon: "✅", color: "#51CF66" },
              { label: "VIP", value: stats.vip, icon: "⭐", color: "#FAB005" },
              { label: "Sent Today", value: stats.sentToday, icon: "📤", color: "#9b59b6" },
              { label: "Received", value: stats.receivedToday, icon: "📥", color: "#1abc9c" },
            ].map((s, i) => (
              <div key={i} style={{ background: T.panel, borderRadius: 12, padding: 12, border: `1px solid ${T.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: "bold", color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: T.subtext }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>📈 Messages - Last 7 Days</div>
            <BarChart days={stats.days} T={T} />
          </div>
        </>
      )}
    </div>
  );

  // ===== BROADCAST =====
  const Broadcast = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: T.bg }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: T.text }}>📢 Broadcast</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>✍️ Message</div>
          <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Type broadcast message..." rows={6}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ fontSize: 12, color: T.subtext, marginTop: 6 }}>{broadcastSelected.length} selected</div>
          {broadcastStatus && <div style={{ fontSize: 12, marginTop: 6, color: broadcastStatus.includes("✅") ? "#25D366" : "#e74c3c" }}>{broadcastStatus}</div>}
          <button onClick={broadcastSend} style={{ width: "100%", marginTop: 10, padding: "10px 0", background: "#075E54", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            📢 Send Broadcast
          </button>
        </div>
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8, color: T.text }}>👥 Select Contacts</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {["", "Hot Lead", "Cold Lead", "Customer", "VIP"].map(l => (
              <button key={l} onClick={() => setBroadcastFilter(l)} style={{
                padding: "3px 10px", borderRadius: 10, fontSize: 10, border: `1px solid ${T.border}`,
                background: broadcastFilter === l ? (LABEL_COLORS[l] || "#eee") : T.input,
                color: broadcastFilter === l && l ? "white" : T.text, cursor: "pointer"
              }}>{l || "All"}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setBroadcastSelected(broadcastContacts.map(c => c.phone))} style={{ flex: 1, padding: "5px 0", background: T.input, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: T.text }}>All ({broadcastContacts.length})</button>
            <button onClick={() => setBroadcastSelected([])} style={{ flex: 1, padding: "5px 0", background: T.input, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: T.text }}>Clear</button>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 300 }}>
            {broadcastContacts.map(c => (
              <div key={c.phone} onClick={() => setBroadcastSelected(prev => prev.includes(c.phone) ? prev.filter(p => p !== c.phone) : [...prev, c.phone])}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: broadcastSelected.includes(c.phone) ? (darkMode ? "#005c4b" : "#e8f8f0") : T.input, border: `1px solid ${broadcastSelected.includes(c.phone) ? "#25D366" : T.border}` }}>
                <input type="checkbox" checked={broadcastSelected.includes(c.phone)} readOnly style={{ accentColor: "#25D366" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: "600", color: T.text }}>{c.name || c.phone}</div>
                  <div style={{ fontSize: 10, color: T.subtext }}>{c.phone}</div>
                </div>
                {c.label && <span style={{ background: LABEL_COLORS[c.label], color: "white", padding: "1px 5px", borderRadius: 8, fontSize: 9 }}>{c.label}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ===== REMINDERS =====
  const RemindersView = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: T.bg }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: T.text }}>⏰ Reminders</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>➕ New Reminder</div>
          <select value={remPhone} onChange={e => setRemPhone(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, marginBottom: 8 }}>
            <option value="">Select contact...</option>
            {contacts.map(c => <option key={c.phone} value={c.phone}>{c.name || c.phone} — {c.phone}</option>)}
          </select>
          <textarea value={remMsg} onChange={e => setRemMsg(e.target.value)} placeholder="Message to send automatically..." rows={4}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
          <input type="datetime-local" value={remDate} onChange={e => setRemDate(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, boxSizing: "border-box", marginBottom: 10 }} />
          <button onClick={addReminder} style={{ width: "100%", padding: "10px 0", background: "#075E54", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>⏰ Set Reminder</button>
        </div>
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>📋 Upcoming ({reminders.length})</div>
          {!reminders.length && <div style={{ color: T.subtext, textAlign: "center", padding: 20, fontSize: 12 }}>No reminders</div>}
          {reminders.map(r => (
            <div key={r._id} style={{ background: T.bg, borderRadius: 10, padding: 10, marginBottom: 8, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: 12, color: T.text }}>{r.name || r.phone}</div>
                  <div style={{ fontSize: 11, color: T.subtext }}>{r.phone}</div>
                  <div style={{ fontSize: 12, color: T.text, marginTop: 3 }}>{r.message}</div>
                  <div style={{ fontSize: 10, color: "#FAB005", marginTop: 3 }}>⏰ {new Date(r.dueAt).toLocaleString("en-IN")}</div>
                </div>
                <button onClick={() => axios.delete(API + "/api/reminders/" + r._id).then(loadReminders)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74c3c", fontSize: 16 }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ===== SETTINGS =====
  const Settings = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: T.bg }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 16, color: T.text }}>⚙️ Settings</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Appearance */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 12, color: T.text }}>🎨 Appearance</div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: T.text }}>🌙 Dark Mode</div>
            <button onClick={() => setDarkMode(!darkMode)} style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: darkMode ? "#25D366" : "#ccc", position: "relative", transition: "background 0.3s"
            }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: darkMode ? 23 : 3, transition: "left 0.3s" }} />
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: T.text }}>🔔 Sound</div>
            <button onClick={() => setNotifSound(!notifSound)} style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: notifSound ? "#25D366" : "#ccc", position: "relative", transition: "background 0.3s"
            }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: notifSound ? 23 : 3, transition: "left 0.3s" }} />
            </button>
          </div>

          <div style={{ fontSize: 12, color: T.subtext, marginBottom: 8 }}>🖼️ Chat Wallpaper</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {WALLPAPERS.map(w => (
              <div key={w.name} onClick={() => setWallpaper(w.value)} title={w.name} style={{
                width: 36, height: 36, borderRadius: 8, cursor: "pointer",
                background: w.value,
                border: wallpaper === w.value ? "3px solid #075E54" : "2px solid transparent",
                boxShadow: wallpaper === w.value ? "0 0 0 2px #25D366" : "0 1px 3px rgba(0,0,0,0.2)"
              }} />
            ))}
          </div>
        </div>

        {/* Account */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 12, color: T.text }}>👤 My Account</div>

          <div style={{ background: T.bg, borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: "bold", color: T.text }}>{currentUser?.displayName || currentUser?.username}</div>
            <div style={{ fontSize: 11, color: T.subtext }}>@{currentUser?.username}</div>
            <div style={{ fontSize: 11, color: currentUser?.role === "admin" ? "#FAB005" : "#25D366", marginTop: 3 }}>
              {currentUser?.role === "admin" ? "⭐ Admin" : "👤 Agent"}
            </div>
          </div>

          <div style={{ fontSize: 12, color: T.subtext, marginBottom: 8 }}>🔑 Change Password</div>
          <input type="password" placeholder="Old password" value={oldPass} onChange={e => setOldPass(e.target.value)}
            style={{ width: "100%", padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, boxSizing: "border-box", marginBottom: 6 }} />
          <input type="password" placeholder="New password (6+ chars)" value={newPass} onChange={e => setNewPass(e.target.value)}
            style={{ width: "100%", padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, boxSizing: "border-box", marginBottom: 8 }} />
          {passMsg && <div style={{ fontSize: 11, marginBottom: 6, color: passMsg.includes("✅") ? "#25D366" : "#e74c3c" }}>{passMsg}</div>}
          <button onClick={changePassword} style={{ width: "100%", padding: "7px 0", background: "#3498db", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
            🔑 Change Password
          </button>

          <div style={{ marginTop: 12 }}>
            <button onClick={handleLogout} style={{ width: "100%", padding: "8px 0", background: "#e74c3c", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 12, color: T.text }}>⌨️ Keyboard Shortcuts</div>
          {[
            ["Ctrl + K", "Search contacts"],
            ["Ctrl + Enter", "Send message"],
            ["Escape", "Close popups"],
            ["Enter", "Send message"],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: T.text }}>{desc}</span>
              <kbd style={{ background: T.bg, padding: "2px 8px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 11, color: T.text }}>{key}</kbd>
            </div>
          ))}
        </div>

        {/* User Management (Admin only) */}
        {currentUser?.role === "admin" && (
          <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 12, color: T.text }}>👥 Team Management</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              <input placeholder="Username" value={newUserName} onChange={e => setNewUserName(e.target.value)}
                style={{ padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12 }} />
              <input placeholder="Display Name" value={newUserDisplay} onChange={e => setNewUserDisplay(e.target.value)}
                style={{ padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12 }} />
              <input type="password" placeholder="Password" value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
                style={{ padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12 }} />
              <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)}
                style={{ padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12 }}>
                <option value="agent">👤 Agent</option>
                <option value="admin">⭐ Admin</option>
              </select>
              <button onClick={addUser} style={{ padding: "7px 0", background: "#075E54", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>➕ Add User</button>
            </div>

            <div style={{ overflowY: "auto", maxHeight: 200 }}>
              {users.map(u => (
                <div key={u._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 8px", background: T.bg, borderRadius: 8, marginBottom: 4, border: `1px solid ${T.border}` }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: "600", color: T.text }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 10, color: u.role === "admin" ? "#FAB005" : T.subtext }}>@{u.username} · {u.role}</div>
                  </div>
                  {u.username !== currentUser?.username && (
                    <button onClick={() => deleteUser(u._id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74c3c", fontSize: 14 }}>🗑</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ===== AUTH GATE =====
  if (!authChecked) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#075E54", color: "white", fontSize: 18 }}>Loading...</div>;
  if (!currentUser) return <LoginPage onLogin={handleLogin} />;

  // ===== MAIN RENDER =====
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', Arial, sans-serif", background: T.bg }}>

      {/* ===== LEFT SIDEBAR ===== */}
      <div style={{ width: "30%", display: "flex", flexDirection: "column", background: T.sidebar, borderRight: `1px solid ${T.border}` }}>

        {/* Header */}
        <div style={{ padding: "10px 14px", background: T.header, color: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 14 }}>
                {(currentUser?.displayName || currentUser?.username || "U").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: "bold", fontSize: 13 }}>{currentUser?.displayName || currentUser?.username}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{currentUser?.role === "admin" ? "⭐ Admin" : "👤 Agent"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setDarkMode(!darkMode)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>{darkMode ? "☀️" : "🌙"}</button>
              <button onClick={() => setTab("settings")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>⚙️</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11 }}>
            <span>👥 {contacts.length}</span>
            <span style={{ cursor: "pointer", color: unreadFilter ? "#25D366" : "rgba(255,255,255,0.6)" }} onClick={() => setUnreadFilter(!unreadFilter)}>🔴 {totalUnread}</span>
            <span>🔥 {contacts.filter(c => c.label === "Hot Lead").length}</span>
            <span>✅ {contacts.filter(c => c.label === "Customer").length}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
          {[
            { id: "chats", label: "💬", title: "Chats" },
            { id: "contacts", label: "👥", title: "Contacts" },
            { id: "broadcast", label: "📢", title: "Broadcast" },
            { id: "reminders", label: "⏰", title: "Reminders" },
            { id: "pipeline", label: "📊", title: "Pipeline" },
            { id: "dashboard", label: "📈", title: "Dashboard" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} title={t.title} style={{
              flex: 1, padding: "10px 4px", border: "none",
              background: tab === t.id ? (darkMode ? "#2a3942" : "#f0f7f0") : "transparent",
              borderBottom: tab === t.id ? "2px solid #25D366" : "2px solid transparent",
              cursor: "pointer", fontSize: 16, color: T.text
            }}>{t.label}</button>
          ))}
        </div>

        {/* Contact tab add form */}
        {tab === "contacts" && (
          <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, background: darkMode ? "#1a252e" : "#fafafa" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}
                style={{ flex: 1, padding: 6, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, background: T.input, color: T.inputText, outline: "none" }} />
              <input placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                style={{ flex: 1, padding: 6, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, background: T.input, color: T.inputText, outline: "none" }} />
              <button onClick={async () => {
                if (!newPhone) return alert("Enter phone");
                try {
                  await axios.post(API + "/api/add-contact", { name: newName, phone: newPhone });
                  setNewName(""); setNewPhone(""); loadContacts();
                } catch (err) { alert(err.response?.data || "Error"); }
              }} style={{ padding: "6px 10px", background: "#075E54", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>➕</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <label style={{ flex: 1, padding: "6px 0", background: T.input, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: T.text, textAlign: "center" }}>
                📂 Import CSV
                <input type="file" accept=".csv" style={{ display: "none" }} onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  const formData = new FormData(); formData.append("file", file);
                  try { setUploadMsg("⏳"); const res = await axios.post(API + "/api/upload-csv", formData); setUploadMsg(`✅ +${res.data.added}`); loadContacts(); }
                  catch { setUploadMsg("❌"); }
                }} />
              </label>
              <button onClick={exportCSV} style={{ flex: 1, padding: "6px 0", background: "#25D366", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11 }}>📥 Export</button>
            </div>
            {uploadMsg && <div style={{ fontSize: 11, marginTop: 4, color: T.subtext }}>{uploadMsg}</div>}
          </div>
        )}

        {/* Label filter */}
        {(tab === "chats" || tab === "contacts") && (
          <div style={{ padding: "6px 10px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${T.border}` }}>
            {["", "Hot Lead", "Cold Lead", "Customer", "VIP"].map(l => (
              <button key={l} onClick={() => setLabelFilter(l === labelFilter ? "" : l)} style={{
                padding: "2px 8px", borderRadius: 10, fontSize: 10, border: `1px solid ${T.border}`,
                background: labelFilter === l && l ? LABEL_COLORS[l] : T.input,
                color: labelFilter === l && l ? "white" : T.text, cursor: "pointer"
              }}>{l || "All"}</button>
            ))}
          </div>
        )}

        {/* Search */}
        {(tab === "chats" || tab === "contacts") && (
          <div style={{ padding: "8px 10px" }}>
            <input id="contact-search" placeholder="🔍 Search... (Ctrl+K)"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${T.border}`, borderRadius: 20, fontSize: 12, boxSizing: "border-box", background: T.input, color: T.inputText, outline: "none" }} />
          </div>
        )}

        {/* Contact list */}
        {(tab === "chats" || tab === "contacts") && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.map(c => (
              <div key={c.phone} onClick={() => { openChat(c); if (tab !== "chats") setTab("chats"); }}
                style={{ padding: "10px 12px", cursor: "pointer", background: active === c.phone ? T.active : T.sidebar, borderBottom: `1px solid ${T.border}`, borderLeft: active === c.phone ? "3px solid #25D366" : "3px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.pinned ? "#FAB005" : "#075E54", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 15, flexShrink: 0 }}>
                    {(c.name || c.phone).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "600", fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.pinned && "📌 "}{c.name || c.phone}
                    </div>
                    <div style={{ fontSize: 11, color: T.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.lastMessage || "No messages"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    {c.unread > 0 && <span style={{ background: "#25D366", color: "white", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }}>{c.unread}</span>}
                    {c.label && <span style={{ background: LABEL_COLORS[c.label], color: "white", padding: "1px 5px", borderRadius: 8, fontSize: 9 }}>{c.label}</span>}
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={e => togglePin(c.phone, e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: c.pinned ? "#FAB005" : T.subtext }}>📌</button>
                      <button onClick={async e => {
                        e.stopPropagation();
                        if (!window.confirm("Delete?")) return;
                        await axios.delete(API + "/api/delete-contact/" + c.phone);
                        if (active === c.phone) { setActive(null); setActiveContact(null); }
                        loadContacts();
                      }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.subtext }}>🗑</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ textAlign: "center", color: T.subtext, padding: 20, fontSize: 13 }}>No contacts found</div>}
          </div>
        )}
      </div>

      {/* ===== MAIN CONTENT ===== */}
      {tab === "chats" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Chat Header */}
          <div style={{ padding: "10px 16px", background: T.header, color: "white", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {activeContact ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#128C7E", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 16 }}>
                  {(activeContact.name || activeContact.phone).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 14 }}>{activeContact.name || activeContact.phone}</div>
                  <div style={{ fontSize: 11, color: "#d4f8e8" }}>
                    {activeContact.name ? activeContact.phone : ""}{typing && " • typing..."}
                  </div>
                </div>
                {activeContact.label && <span style={{ background: LABEL_COLORS[activeContact.label], padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>{activeContact.label}</span>}
              </div>
            ) : (
              <div style={{ fontWeight: "bold", fontSize: 14 }}>💬 Select a chat</div>
            )}
            {activeContact && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setShowMsgSearch(!showMsgSearch)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "5px 9px", borderRadius: 8, cursor: "pointer" }}>🔍</button>
                <button onClick={() => setShowProfile(!showProfile)} style={{ background: showProfile ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "5px 9px", borderRadius: 8, cursor: "pointer" }}>👤</button>
              </div>
            )}
          </div>

          {/* Message search */}
          {showMsgSearch && active && (
            <div style={{ padding: "8px 12px", background: darkMode ? "#1a252e" : "#f8f8f8", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
              <input placeholder="Search in chat..." value={msgSearch} onChange={e => { setMsgSearch(e.target.value); if (!e.target.value) setMsgSearchResults(null); }}
                onKeyDown={e => e.key === "Enter" && searchMessages()}
                style={{ flex: 1, padding: "6px 12px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, outline: "none" }} />
              <button onClick={searchMessages} style={{ padding: "6px 14px", background: "#075E54", color: "white", border: "none", borderRadius: 16, cursor: "pointer", fontSize: 12 }}>Search</button>
              {msgSearchResults !== null && <button onClick={() => { setMsgSearchResults(null); setMsgSearch(""); }} style={{ padding: "6px 10px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", fontSize: 12, color: T.text }}>Clear ({msgSearchResults.length})</button>}
            </div>
          )}

          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Messages */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, padding: 12, overflowY: "auto", background: T.chatbg, display: "flex", flexDirection: "column" }}>
                {!active && (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.4)" }}>
                    <div style={{ fontSize: 60, marginBottom: 12 }}>💬</div>
                    <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 6 }}>WhatsApp CRM</div>
                    <div style={{ fontSize: 13 }}>Select a contact to start chatting</div>
                    <div style={{ fontSize: 11, marginTop: 8, opacity: 0.6 }}>Ctrl+K to search contacts</div>
                  </div>
                )}
                {displayMessages.map((m, i) => {
                  const curr = m.createdAt ? new Date(m.createdAt).toDateString() : null;
                  const prev = i > 0 && displayMessages[i - 1].createdAt ? new Date(displayMessages[i - 1].createdAt).toDateString() : null;
                  const showDivider = curr && curr !== prev;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                      {showDivider && (
                        <div style={{ textAlign: "center", margin: "10px 0", fontSize: 11 }}>
                          <span style={{ background: "rgba(0,0,0,0.15)", color: "#555", padding: "2px 12px", borderRadius: 10 }}>{formatDateDivider(m.createdAt)}</span>
                        </div>
                      )}
                      <div style={{ maxWidth: "62%", padding: "8px 12px", margin: "2px 6px",
                        borderRadius: m.direction === "outgoing" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        background: m.direction === "outgoing" ? T.outgoing : T.incoming,
                        alignSelf: m.direction === "outgoing" ? "flex-end" : "flex-start",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)", color: T.text }}>
                        {m.media ? (
                          m.mimeType?.startsWith("image") ? <img src={API + "/uploads/" + m.message} width="200" style={{ borderRadius: 8 }} alt="media" /> :
                          m.mimeType?.startsWith("audio") ? <audio controls src={API + "/uploads/" + m.message} style={{ width: 200 }} /> :
                          m.mimeType?.startsWith("video") ? <video controls src={API + "/uploads/" + m.message} width="200" style={{ borderRadius: 8 }} /> :
                          <a href={API + "/uploads/" + m.message} target="_blank" rel="noreferrer" style={{ color: "#075E54" }}>📎 File</a>
                        ) : <div style={{ lineHeight: 1.4, fontSize: 14 }}>{m.message}</div>}
                        <div style={{ fontSize: 10, color: T.subtext, textAlign: "right", marginTop: 3 }}>
                          {formatTime(m.createdAt)} {m.direction === "outgoing" ? (m.status === "seen" ? "✔✔" : "✔") : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              {active && (
                <div style={{ background: T.input, borderTop: `1px solid ${T.border}` }}>
                  {/* Quick replies */}
                  {showQuickReplies && (
                    <div style={{ padding: "8px 12px", background: T.panel, borderTop: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 11, color: T.subtext, marginBottom: 4 }}>⚡ Quick Replies</div>
                      {QUICK_REPLIES.map((qr, i) => (
                        <div key={i} onClick={() => sendMsg(qr)} style={{ padding: "6px 10px", background: T.bg, borderRadius: 8, marginBottom: 4, cursor: "pointer", fontSize: 12, border: `1px solid ${T.border}`, color: T.text }}>{qr}</div>
                      ))}
                    </div>
                  )}
                  {/* Emoji picker */}
                  {showEmojiPicker && (
                    <div style={{ padding: "8px 12px", background: T.panel, borderTop: `1px solid ${T.border}`, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {EMOJI_LIST.map(emoji => (
                        <button key={emoji} onClick={() => setText(prev => prev + emoji)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px", borderRadius: 6, lineHeight: 1 }}>{emoji}</button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", padding: "8px 10px", gap: 6, alignItems: "center" }}>
                    <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowQuickReplies(false); }} style={{ background: showEmojiPicker ? "#FAB005" : T.panel, border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 10px", cursor: "pointer", fontSize: 16, color: showEmojiPicker ? "white" : T.text }}>😊</button>
                    <button onClick={() => { setShowQuickReplies(!showQuickReplies); setShowEmojiPicker(false); }} style={{ background: showQuickReplies ? "#075E54" : T.panel, color: showQuickReplies ? "white" : T.subtext, border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 10px", cursor: "pointer", fontSize: 14 }}>⚡</button>
                    <label style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 10px", cursor: "pointer", fontSize: 16, color: T.subtext }}>
                      📎<input type="file" style={{ display: "none" }} onChange={sendFile} />
                    </label>
                    <input value={text} onChange={e => {
                      setText(e.target.value);
                      socket.emit("typing", active);
                      clearTimeout(typingTimeout.current);
                      typingTimeout.current = setTimeout(() => socket.emit("stop_typing", active), 1000);
                    }}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                      placeholder="Type a message... (Enter to send)"
                      style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${T.border}`, fontSize: 13, outline: "none", background: T.panel, color: T.inputText }} />
                    <button onClick={() => sendMsg()} style={{ background: "#075E54", color: "white", border: "none", borderRadius: "50%", width: 42, height: 42, cursor: "pointer", fontSize: 16 }}>➤</button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile panel */}
            {showProfile && activeContact && (
              <div style={{ width: 250, background: T.panel, borderLeft: `1px solid ${T.border}`, overflowY: "auto" }}>
                <div style={{ padding: 14, background: "#075E54", color: "white", textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#128C7E", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 22, margin: "0 auto 8px" }}>
                    {(activeContact.name || activeContact.phone).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ fontWeight: "bold" }}>{activeContact.name || "No Name"}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{activeContact.phone}</div>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: T.subtext, marginBottom: 6 }}>🏷️ Label</div>
                    <select value={activeContact.label || ""} onChange={e => updateLabel(activeContact.phone, e.target.value)}
                      style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, background: T.input, color: T.inputText }}>
                      <option value="">None</option>
                      <option value="Hot Lead">🔥 Hot Lead</option>
                      <option value="Cold Lead">❄️ Cold Lead</option>
                      <option value="Customer">✅ Customer</option>
                      <option value="VIP">⭐ VIP</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: T.subtext, marginBottom: 6 }}>📝 Notes</div>
                    <textarea value={notesText} onChange={e => { setNotesText(e.target.value); setNotesSaved(false); }}
                      placeholder="Notes..." rows={4}
                      style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, resize: "vertical", boxSizing: "border-box", background: T.input, color: T.inputText }} />
                    <button onClick={saveNotes} style={{ width: "100%", padding: "7px 0", marginTop: 4, background: notesSaved ? "#25D366" : "#075E54", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                      {notesSaved ? "✅ Saved!" : "💾 Save Notes"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: T.subtext }}>
                    <div>📅 Added: {activeContact.createdAt ? new Date(activeContact.createdAt).toLocaleDateString("en-IN") : "-"}</div>
                    <div style={{ marginTop: 4 }}>📌 Pinned: {activeContact.pinned ? "Yes" : "No"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : tab === "dashboard" ? <Dashboard /> :
        tab === "broadcast" ? <Broadcast /> :
        tab === "reminders" ? <RemindersView /> :
        tab === "pipeline" ? <PipelineView /> :
        tab === "settings" ? <Settings /> : null}
    </div>
  );
}
