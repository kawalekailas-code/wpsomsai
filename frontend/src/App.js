import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = process.env.REACT_APP_API;

const LABEL_COLORS = {
  "Hot Lead": "#FF6B6B",
  "Cold Lead": "#74C0FC",
  "Customer": "#51CF66",
  "VIP": "#FAB005",
  "": "#ccc"
};

const QUICK_REPLIES = [
  "नमस्कार! आम्ही लवकरच reply करतो 🙏",
  "धन्यवाद तुमच्या संदेशासाठी!",
  "कृपया थोडा वेळ थांबा, आम्ही check करतो.",
  "तुमची order confirm झाली ✅",
  "आजच आम्हाला call करा: 9XXXXXXXXX"
];

// ===== MINI BAR CHART =====
const BarChart = ({ days }) => {
  const max = Math.max(...days.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, padding: "0 4px" }}>
      {days.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ fontSize: 9, color: "#888" }}>{d.count}</div>
          <div style={{
            width: "100%", background: "#25D366", borderRadius: "4px 4px 0 0",
            height: `${(d.count / max) * 60}px`, minHeight: d.count ? 4 : 0, transition: "height 0.5s"
          }} />
          <div style={{ fontSize: 9, color: "#888" }}>{d.date}</div>
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState(null);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState("chats");

  const [uploadMsg, setUploadMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [totalCount, setTotalCount] = useState(0);

  // Phase 1 states
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);

  // Phase 2 states
  const [darkMode, setDarkMode] = useState(false);
  const [stats, setStats] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastFilter, setBroadcastFilter] = useState("");
  const [broadcastSelected, setBroadcastSelected] = useState([]);
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const [reminders, setReminders] = useState([]);
  const [remPhone, setRemPhone] = useState("");
  const [remMsg, setRemMsg] = useState("");
  const [remDate, setRemDate] = useState("");
  const [msgSearch, setMsgSearch] = useState("");
  const [msgSearchResults, setMsgSearchResults] = useState(null);
  const [showMsgSearch, setShowMsgSearch] = useState(false);

  const bottomRef = useRef();
  const typingTimeout = useRef(null);

  // Theme
  const T = {
    bg: darkMode ? "#111b21" : "#f0f2f5",
    panel: darkMode ? "#202c33" : "white",
    sidebar: darkMode ? "#111b21" : "white",
    border: darkMode ? "#2a3942" : "#eee",
    text: darkMode ? "#e9edef" : "#111",
    subtext: darkMode ? "#8696a0" : "#888",
    chatbg: darkMode ? "#0b141a" : "#ECE5DD",
    outgoing: darkMode ? "#005c4b" : "#DCF8C6",
    incoming: darkMode ? "#202c33" : "white",
    input: darkMode ? "#2a3942" : "#f0f0f0",
    inputText: darkMode ? "#e9edef" : "#111",
    active: darkMode ? "#2a3942" : "#f0f7f0",
    header: "#075E54"
  };

  const loadContacts = async () => {
    const res = await axios.get(API + "/api/contacts");
    setContacts(res.data);
    setTotalCount(res.data.length);
  };

  const loadStats = async () => {
    try {
      const res = await axios.get(API + "/api/stats");
      setStats(res.data);
    } catch (err) { console.log("Stats error", err); }
  };

  const loadReminders = async () => {
    try {
      const res = await axios.get(API + "/api/reminders");
      setReminders(res.data);
    } catch (err) { console.log("Reminders error", err); }
  };

  useEffect(() => {
    loadContacts();
    loadReminders();
  }, []);

  useEffect(() => {
    if (tab === "dashboard") loadStats();
  }, [tab]);

  const openChat = async (contact) => {
    setActive(contact.phone);
    setActiveContact(contact);
    setNotesText(contact.notes || "");
    setNotesSaved(false);
    setShowProfile(false);
    setShowQuickReplies(false);
    setShowMsgSearch(false);
    setMsgSearch("");
    setMsgSearchResults(null);

    const res = await axios.get(API + "/api/messages/" + contact.phone);
    setMessages(res.data);

    await axios.post(API + "/api/seen/" + contact.phone);
    socket.emit("join", contact.phone);

    setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, unread: 0 } : c));
  };

  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, msg]);
      loadContacts();
    });
    socket.on("typing", (phone) => { if (phone === active) setTyping(true); });
    socket.on("stop_typing", (phone) => { if (phone === active) setTyping(false); });
    socket.on("message_status", ({ phone, status }) => {
      setMessages(prev => prev.map(m => m.phone === phone ? { ...m, status } : m));
    });
    socket.on("contact_update", ({ phone, lastMessage }) => {
      setContacts(prev => prev.map(c => c.phone === phone ? { ...c, lastMessage } : c));
    });
    socket.on("reminder_sent", ({ id }) => {
      setReminders(prev => prev.filter(r => r._id !== id));
    });
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    return d.toLocaleDateString();
  };

  const sendMsg = async (msgText) => {
    const msg = msgText || text;
    if (!active) return alert("Select chat first");
    if (!msg.trim()) return alert("Enter message");
    await axios.post(API + "/api/send", { phone: active, message: msg });
    setMessages(prev => [...prev, { phone: active, message: msg, direction: "outgoing", status: "sent", createdAt: new Date() }]);
    setText("");
    setShowQuickReplies(false);
    socket.emit("stop_typing", active);
  };

  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !active) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("phone", active);
    await axios.post(API + "/api/send/media", formData);
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
    setContacts(prev => prev.map(c => c.phone === phone ? { ...c, pinned: res.data.pinned } : c));
    loadContacts();
  };

  const searchMessages = async () => {
    if (!msgSearch.trim() || !active) return;
    const res = await axios.get(API + "/api/search-messages/" + active + "?q=" + msgSearch);
    setMsgSearchResults(res.data);
  };

  const broadcastSend = async () => {
    if (!broadcastMsg.trim()) return alert("Enter message");
    if (!broadcastSelected.length) return alert("Select contacts");
    setBroadcastStatus(`Sending to ${broadcastSelected.length} contacts...`);
    try {
      await axios.post(API + "/api/broadcast", { phones: broadcastSelected, message: broadcastMsg });
      setBroadcastStatus(`✅ Sent to ${broadcastSelected.length} contacts! (running in background)`);
      setBroadcastSelected([]);
      setBroadcastMsg("");
    } catch {
      setBroadcastStatus("❌ Broadcast failed");
    }
  };

  const addReminder = async () => {
    if (!remPhone || !remMsg || !remDate) return alert("Fill all fields");
    try {
      const contact = contacts.find(c => c.phone === remPhone);
      await axios.post(API + "/api/reminders", {
        phone: remPhone,
        name: contact?.name || remPhone,
        message: remMsg,
        dueAt: remDate
      });
      setRemPhone(""); setRemMsg(""); setRemDate("");
      loadReminders();
    } catch { alert("Error adding reminder"); }
  };

  const deleteReminder = async (id) => {
    await axios.delete(API + "/api/reminders/" + id);
    loadReminders();
  };

  const exportCSV = () => window.open(API + "/api/export-csv", "_blank");

  // Broadcast contact list
  const broadcastContacts = contacts.filter(c =>
    !broadcastFilter || c.label === broadcastFilter
  );

  // Filtered contacts list
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
  const hotLeads = contacts.filter(c => c.label === "Hot Lead").length;
  const customers = contacts.filter(c => c.label === "Customer").length;

  const displayMessages = msgSearchResults !== null ? msgSearchResults : messages;

  // ===== PIPELINE VIEW =====
  const PipelineView = () => {
    const columns = ["Hot Lead", "Cold Lead", "Customer", "VIP", ""];
    const colNames = { "Hot Lead": "🔥 Hot Lead", "Cold Lead": "❄️ Cold Lead", "Customer": "✅ Customer", "VIP": "⭐ VIP", "": "📋 Untagged" };
    return (
      <div style={{ flex: 1, overflow: "hidden", padding: 16, display: "flex", flexDirection: "column", background: T.bg }}>
        <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 12, color: T.text }}>📊 Pipeline View</div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", flex: 1, paddingBottom: 8 }}>
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
                      <div style={{ fontWeight: "600", fontSize: 12, color: T.text }}>
                        {c.name || c.phone}
                      </div>
                      <div style={{ fontSize: 11, color: T.subtext, marginTop: 2 }}>
                        {c.phone}
                      </div>
                      {c.lastMessage && (
                        <div style={{ fontSize: 10, color: T.subtext, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.lastMessage}
                        </div>
                      )}
                    </div>
                  ))}
                  {col_contacts.length === 0 && (
                    <div style={{ fontSize: 11, color: T.subtext, textAlign: "center", padding: 8 }}>Empty</div>
                  )}
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
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: T.text }}>📊 Dashboard</div>

      {!stats ? (
        <div style={{ color: T.subtext, textAlign: "center", padding: 40 }}>Loading stats...</div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Total Contacts", value: stats.totalContacts, icon: "👥", color: "#075E54" },
              { label: "Unread Chats", value: stats.totalUnread, icon: "🔴", color: "#e74c3c" },
              { label: "Messages Today", value: stats.msgToday, icon: "💬", color: "#3498db" },
              { label: "Hot Leads", value: stats.hotLeads, icon: "🔥", color: "#FF6B6B" },
              { label: "Customers", value: stats.customers, icon: "✅", color: "#51CF66" },
              { label: "VIP", value: stats.vip, icon: "⭐", color: "#FAB005" },
              { label: "Sent Today", value: stats.sentToday, icon: "📤", color: "#9b59b6" },
              { label: "Received Today", value: stats.receivedToday, icon: "📥", color: "#1abc9c" },
            ].map((s, i) => (
              <div key={i} style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: "bold", color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: T.subtext }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Delivery rates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>📊 Message Delivery</div>
              {[
                { label: "Sent", value: stats.totalSent, color: "#3498db" },
                { label: "Delivered ✔✔", value: stats.totalDelivered, color: "#25D366" },
                { label: "Seen 👁️", value: stats.totalSeen, color: "#34b7f1" },
              ].map((s, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.text, marginBottom: 3 }}>
                    <span>{s.label}</span><span>{s.value}</span>
                  </div>
                  <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${stats.totalSent ? (s.value / stats.totalSent) * 100 : 0}%`, background: s.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>🏷️ Contact Labels</div>
              {Object.entries(stats.labels).map(([label, count]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: T.text }}>{label || "None"}</span>
                  <span style={{ background: LABEL_COLORS[label] || "#ccc", color: "white", padding: "1px 8px", borderRadius: 10, fontSize: 11 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 7-day chart */}
          <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>📈 Messages - Last 7 Days</div>
            <BarChart days={stats.days} />
          </div>
        </>
      )}
    </div>
  );

  // ===== BROADCAST =====
  const Broadcast = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: T.bg }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: T.text }}>📢 Broadcast Message</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Left - Message */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>✍️ Message</div>

          <textarea
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
            placeholder="Type broadcast message..."
            rows={6}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
          />

          <div style={{ marginTop: 8, fontSize: 12, color: T.subtext }}>
            {broadcastSelected.length} contacts selected
          </div>

          {broadcastStatus && (
            <div style={{ marginTop: 6, fontSize: 12, color: broadcastStatus.includes("✅") ? "#25D366" : "#e74c3c" }}>
              {broadcastStatus}
            </div>
          )}

          <button onClick={broadcastSend} style={{
            width: "100%", marginTop: 10, padding: "10px 0", background: "#075E54", color: "white",
            border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 14
          }}>
            📢 Send Broadcast
          </button>
        </div>

        {/* Right - Contact selection */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8, color: T.text }}>👥 Select Contacts</div>

          {/* Filter by label */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {["", "Hot Lead", "Cold Lead", "Customer", "VIP"].map(l => (
              <button key={l} onClick={() => setBroadcastFilter(l)} style={{
                padding: "3px 10px", borderRadius: 10, fontSize: 10, border: "1px solid #ddd",
                background: broadcastFilter === l ? (LABEL_COLORS[l] || "#eee") : T.input,
                color: broadcastFilter === l && l ? "white" : T.text, cursor: "pointer"
              }}>{l || "All"}</button>
            ))}
          </div>

          {/* Select all */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <button onClick={() => setBroadcastSelected(broadcastContacts.map(c => c.phone))} style={{
              fontSize: 11, padding: "3px 10px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text
            }}>Select All ({broadcastContacts.length})</button>
            <button onClick={() => setBroadcastSelected([])} style={{
              fontSize: 11, padding: "3px 10px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text
            }}>Clear</button>
          </div>

          <div style={{ overflowY: "auto", maxHeight: 280 }}>
            {broadcastContacts.map(c => (
              <div key={c.phone} onClick={() => setBroadcastSelected(prev =>
                prev.includes(c.phone) ? prev.filter(p => p !== c.phone) : [...prev, c.phone]
              )} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                borderRadius: 8, marginBottom: 3, cursor: "pointer",
                background: broadcastSelected.includes(c.phone) ? (darkMode ? "#005c4b" : "#e8f8f0") : T.input,
                border: `1px solid ${broadcastSelected.includes(c.phone) ? "#25D366" : T.border}`
              }}>
                <input type="checkbox" checked={broadcastSelected.includes(c.phone)} readOnly style={{ accentColor: "#25D366" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: "600", color: T.text }}>{c.name || c.phone}</div>
                  <div style={{ fontSize: 10, color: T.subtext }}>{c.phone}</div>
                </div>
                {c.label && <span style={{ background: LABEL_COLORS[c.label], color: "white", padding: "1px 6px", borderRadius: 8, fontSize: 9 }}>{c.label}</span>}
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
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: T.text }}>⏰ Follow-up Reminders</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Add reminder */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>➕ New Reminder</div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.subtext, marginBottom: 4 }}>Contact</div>
            <select value={remPhone} onChange={e => setRemPhone(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12 }}>
              <option value="">Select contact...</option>
              {contacts.map(c => (
                <option key={c.phone} value={c.phone}>{c.name || c.phone} — {c.phone}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: T.subtext, marginBottom: 4 }}>Message to send</div>
            <textarea value={remMsg} onChange={e => setRemMsg(e.target.value)}
              placeholder="Message that will be sent automatically..."
              rows={4}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: T.subtext, marginBottom: 4 }}>Date & Time</div>
            <input type="datetime-local" value={remDate} onChange={e => setRemDate(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12, boxSizing: "border-box" }} />
          </div>

          <button onClick={addReminder} style={{
            width: "100%", padding: "10px 0", background: "#075E54", color: "white",
            border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 13
          }}>
            ⏰ Set Reminder
          </button>
        </div>

        {/* Upcoming reminders */}
        <div style={{ background: T.panel, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 10, color: T.text }}>📋 Upcoming ({reminders.length})</div>

          {reminders.length === 0 && (
            <div style={{ color: T.subtext, fontSize: 12, textAlign: "center", padding: 20 }}>No reminders yet</div>
          )}

          {reminders.map(r => (
            <div key={r._id} style={{ background: T.bg, borderRadius: 10, padding: 10, marginBottom: 8, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "600", fontSize: 12, color: T.text }}>{r.name || r.phone}</div>
                  <div style={{ fontSize: 11, color: T.subtext }}>{r.phone}</div>
                  <div style={{ fontSize: 12, color: T.text, marginTop: 4 }}>{r.message}</div>
                  <div style={{ fontSize: 10, color: "#FAB005", marginTop: 4 }}>
                    ⏰ {new Date(r.dueAt).toLocaleString("en-IN")}
                  </div>
                </div>
                <button onClick={() => deleteReminder(r._id)} style={{
                  background: "none", border: "none", cursor: "pointer", color: "#e74c3c", fontSize: 16
                }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ===== MAIN RENDER =====
  const isRightPanel = tab === "chats";

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', Arial, sans-serif", background: T.bg }}>

      {/* ===== LEFT SIDEBAR ===== */}
      <div style={{ width: "30%", display: "flex", flexDirection: "column", background: T.sidebar, borderRight: `1px solid ${T.border}` }}>

        {/* Header */}
        <div style={{ padding: "12px 14px", background: T.header, color: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: "bold", fontSize: 15 }}>📱 WhatsApp CRM</div>
            <button onClick={() => setDarkMode(!darkMode)} style={{
              background: "rgba(255,255,255,0.2)", border: "none", color: "white",
              padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontSize: 14
            }}>{darkMode ? "☀️" : "🌙"}</button>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11 }}>
            <span>👥 {totalCount}</span>
            <span style={{ cursor: "pointer", color: unreadFilter ? "#25D366" : "#ccc" }} onClick={() => setUnreadFilter(!unreadFilter)}>🔴 {totalUnread}</span>
            <span>🔥 {hotLeads}</span>
            <span>✅ {customers}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
          {[
            { id: "chats", label: "💬" },
            { id: "contacts", label: "👥" },
            { id: "broadcast", label: "📢" },
            { id: "reminders", label: "⏰" },
            { id: "pipeline", label: "📊" },
            { id: "dashboard", label: "📈" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} title={t.id} style={{
              flex: 1, padding: "10px 4px", border: "none",
              background: tab === t.id ? (darkMode ? "#2a3942" : "#f0f7f0") : "transparent",
              borderBottom: tab === t.id ? "2px solid #075E54" : "none",
              cursor: "pointer", fontSize: 16, color: T.text
            }}>{t.label}</button>
          ))}
        </div>

        {/* Contact tab extras */}
        {tab === "contacts" && (
          <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, background: darkMode ? "#1a252e" : "#fafafa" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}
                style={{ flex: 1, padding: 6, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, background: T.input, color: T.inputText }} />
              <input placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                style={{ flex: 1, padding: 6, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, background: T.input, color: T.inputText }} />
              <button onClick={async () => {
                if (!newPhone) return alert("Enter phone");
                try {
                  await axios.post(API + "/api/add-contact", { name: newName, phone: newPhone });
                  setNewName(""); setNewPhone(""); loadContacts();
                } catch (err) { alert(err.response?.data || "Error"); }
              }} style={{ padding: "6px 10px", background: "#075E54", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>➕</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <label style={{ flex: 1, padding: "6px 10px", background: T.input, borderRadius: 6, cursor: "pointer", fontSize: 11, border: `1px solid ${T.border}`, color: T.text, textAlign: "center" }}>
                📂 Import CSV
                <input type="file" accept=".csv" style={{ display: "none" }} onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    setUploadMsg("⏳ Uploading...");
                    const res = await axios.post(API + "/api/upload-csv", formData);
                    setUploadMsg(`✅ Added ${res.data.added}/${res.data.count}`);
                    loadContacts();
                  } catch { setUploadMsg("❌ Failed"); }
                }} />
              </label>
              <button onClick={exportCSV} style={{ flex: 1, padding: "6px 10px", background: "#25D366", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                📥 Export CSV
              </button>
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

        {/* Search bar */}
        {(tab === "chats" || tab === "contacts") && (
          <div style={{ padding: "8px 10px" }}>
            <input placeholder="🔍 Search..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${T.border}`, borderRadius: 20, fontSize: 12, boxSizing: "border-box", background: T.input, color: T.inputText }} />
          </div>
        )}

        {/* Contact list */}
        {(tab === "chats" || tab === "contacts") && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", color: T.subtext, padding: 20, fontSize: 13 }}>No contacts found</div>
            )}
            {filtered.map(c => (
              <div key={c.phone} onClick={() => openChat(c)} style={{
                padding: "10px 12px", cursor: "pointer",
                background: active === c.phone ? T.active : T.sidebar,
                borderBottom: `1px solid ${T.border}`,
                borderLeft: active === c.phone ? "3px solid #075E54" : "3px solid transparent"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: c.pinned ? "#FAB005" : "#075E54",
                    color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "bold", fontSize: 14, flexShrink: 0
                  }}>
                    {(c.name || c.phone).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "600", fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.pinned && "📌 "}{c.name || c.phone}
                    </div>
                    <div style={{ fontSize: 11, color: T.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.lastMessage || "No messages yet"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    {c.unread > 0 && (
                      <span style={{ background: "#25D366", color: "white", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }}>{c.unread}</span>
                    )}
                    {c.label && (
                      <span style={{ background: LABEL_COLORS[c.label], color: "white", padding: "1px 5px", borderRadius: 8, fontSize: 9 }}>{c.label}</span>
                    )}
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={(e) => togglePin(c.phone, e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: c.pinned ? "#FAB005" : T.subtext }}>📌</button>
                      <button onClick={async (e) => {
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
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#128C7E", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 15 }}>
                  {(activeContact.name || activeContact.phone).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 14 }}>
                    {activeContact.name || activeContact.phone}
                  </div>
                  <div style={{ fontSize: 11, color: "#d4f8e8" }}>
                    {activeContact.name ? activeContact.phone : ""}
                    {typing && " • typing..."}
                  </div>
                </div>
                {activeContact.label && (
                  <span style={{ background: LABEL_COLORS[activeContact.label], padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>{activeContact.label}</span>
                )}
              </div>
            ) : (
              <div style={{ fontWeight: "bold" }}>💬 Select a chat</div>
            )}

            {activeContact && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setShowMsgSearch(!showMsgSearch)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                  🔍
                </button>
                <button onClick={() => setShowProfile(!showProfile)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                  {showProfile ? "✕" : "👤"}
                </button>
              </div>
            )}
          </div>

          {/* Message search bar */}
          {showMsgSearch && active && (
            <div style={{ padding: "8px 12px", background: darkMode ? "#1a252e" : "#f8f8f8", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
              <input
                placeholder="Search in chat..."
                value={msgSearch}
                onChange={e => { setMsgSearch(e.target.value); if (!e.target.value) setMsgSearchResults(null); }}
                onKeyDown={e => { if (e.key === "Enter") searchMessages(); }}
                style={{ flex: 1, padding: "6px 12px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.input, color: T.inputText, fontSize: 12 }}
              />
              <button onClick={searchMessages} style={{ padding: "6px 14px", background: "#075E54", color: "white", border: "none", borderRadius: 16, cursor: "pointer", fontSize: 12 }}>Search</button>
              {msgSearchResults !== null && (
                <button onClick={() => { setMsgSearchResults(null); setMsgSearch(""); }} style={{ padding: "6px 10px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", fontSize: 12, color: T.text }}>
                  Clear ({msgSearchResults.length})
                </button>
              )}
            </div>
          )}

          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Messages */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, padding: 12, overflowY: "auto", background: T.chatbg, display: "flex", flexDirection: "column" }}>

                {!active && (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.subtext }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                    <div style={{ fontSize: 14 }}>Select a contact to start chatting</div>
                  </div>
                )}

                {msgSearchResults !== null && msgSearchResults.length === 0 && (
                  <div style={{ textAlign: "center", color: T.subtext, padding: 20, fontSize: 13 }}>No messages found</div>
                )}

                {displayMessages.map((m, i) => {
                  const curr = m.createdAt ? new Date(m.createdAt).toDateString() : null;
                  const prev = i > 0 && displayMessages[i - 1].createdAt ? new Date(displayMessages[i - 1].createdAt).toDateString() : null;
                  const showDivider = curr && curr !== prev;

                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                      {showDivider && (
                        <div style={{ textAlign: "center", margin: "10px 0", fontSize: 11, color: T.subtext }}>
                          <span style={{ background: "rgba(128,128,128,0.2)", padding: "2px 10px", borderRadius: 10 }}>
                            {formatDateDivider(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <div style={{
                        maxWidth: "60%", padding: "8px 12px", margin: "3px 6px",
                        borderRadius: m.direction === "outgoing" ? "15px 15px 4px 15px" : "15px 15px 15px 4px",
                        background: m.direction === "outgoing" ? T.outgoing : T.incoming,
                        alignSelf: m.direction === "outgoing" ? "flex-end" : "flex-start",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                        color: T.text
                      }}>
                        {m.media ? (
                          m.mimeType?.startsWith("image") ? (
                            <img src={API + "/uploads/" + m.message} width="200" style={{ borderRadius: 8 }} alt="media" />
                          ) : m.mimeType?.startsWith("audio") ? (
                            <audio controls src={API + "/uploads/" + m.message} style={{ width: 200 }} />
                          ) : m.mimeType?.startsWith("video") ? (
                            <video controls src={API + "/uploads/" + m.message} width="200" style={{ borderRadius: 8 }} />
                          ) : (
                            <a href={API + "/uploads/" + m.message} target="_blank" rel="noreferrer" style={{ color: "#075E54" }}>📎 File</a>
                          )
                        ) : m.message}
                        <div style={{ fontSize: 10, color: T.subtext, textAlign: "right", marginTop: 2 }}>
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
                  {showQuickReplies && (
                    <div style={{ padding: "8px 12px", background: T.panel, borderTop: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 11, color: T.subtext, marginBottom: 4 }}>⚡ Quick Replies</div>
                      {QUICK_REPLIES.map((qr, i) => (
                        <div key={i} onClick={() => sendMsg(qr)} style={{
                          padding: "6px 10px", background: T.bg, borderRadius: 8, marginBottom: 4,
                          cursor: "pointer", fontSize: 12, border: `1px solid ${T.border}`, color: T.text
                        }}>{qr}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", padding: "8px 10px", gap: 6, alignItems: "center" }}>
                    <button onClick={() => setShowQuickReplies(!showQuickReplies)} style={{
                      background: showQuickReplies ? "#075E54" : T.panel, color: showQuickReplies ? "white" : T.subtext,
                      border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 10px", cursor: "pointer", fontSize: 14
                    }}>⚡</button>

                    <label style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 10px", cursor: "pointer", fontSize: 14, color: T.subtext }}>
                      📎
                      <input type="file" style={{ display: "none" }} onChange={sendFile} />
                    </label>

                    <input
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        socket.emit("typing", active);
                        clearTimeout(typingTimeout.current);
                        typingTimeout.current = setTimeout(() => socket.emit("stop_typing", active), 1000);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendMsg(); }}
                      placeholder="Type a message..."
                      style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${T.border}`, fontSize: 13, outline: "none", background: T.panel, color: T.inputText }}
                    />

                    <button onClick={() => sendMsg()} style={{
                      background: "#075E54", color: "white", border: "none",
                      borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 16
                    }}>➤</button>
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
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: T.subtext, marginBottom: 6 }}>🏷️ Label</div>
                    <select value={activeContact.label || ""} onChange={e => updateLabel(activeContact.phone, e.target.value)}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, background: T.input, color: T.inputText }}>
                      <option value="">None</option>
                      <option value="Hot Lead">🔥 Hot Lead</option>
                      <option value="Cold Lead">❄️ Cold Lead</option>
                      <option value="Customer">✅ Customer</option>
                      <option value="VIP">⭐ VIP</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: T.subtext, marginBottom: 6 }}>📝 Notes</div>
                    <textarea value={notesText} onChange={e => { setNotesText(e.target.value); setNotesSaved(false); }}
                      placeholder="Notes about this contact..." rows={5}
                      style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, resize: "vertical", boxSizing: "border-box", background: T.input, color: T.inputText }} />
                    <button onClick={saveNotes} style={{
                      width: "100%", padding: "7px 0", marginTop: 4,
                      background: notesSaved ? "#25D366" : "#075E54", color: "white",
                      border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12
                    }}>{notesSaved ? "✅ Saved!" : "💾 Save Notes"}</button>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: T.subtext, marginBottom: 6 }}>⏰ Set Reminder</div>
                    <input type="datetime-local" onChange={e => setRemDate(e.target.value)}
                      style={{ width: "100%", padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 11, boxSizing: "border-box", background: T.input, color: T.inputText }} />
                    <textarea placeholder="Reminder message..." rows={2} value={remMsg} onChange={e => setRemMsg(e.target.value)}
                      style={{ width: "100%", padding: 7, marginTop: 6, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 11, resize: "none", boxSizing: "border-box", background: T.input, color: T.inputText }} />
                    <button onClick={async () => {
                      if (!remMsg || !remDate) return alert("Fill message and date");
                      await axios.post(API + "/api/reminders", { phone: activeContact.phone, name: activeContact.name, message: remMsg, dueAt: remDate });
                      setRemMsg(""); setRemDate("");
                      loadReminders();
                      alert("✅ Reminder set!");
                    }} style={{
                      width: "100%", padding: "6px 0", marginTop: 4, background: "#FAB005",
                      color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12
                    }}>⏰ Set Reminder</button>
                  </div>

                  <div style={{ fontSize: 11, color: T.subtext }}>
                    <div>📅 Added: {activeContact.createdAt ? new Date(activeContact.createdAt).toLocaleDateString() : "-"}</div>
                    <div style={{ marginTop: 4 }}>📌 Pinned: {activeContact.pinned ? "Yes" : "No"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : tab === "dashboard" ? (
        <Dashboard />
      ) : tab === "broadcast" ? (
        <Broadcast />
      ) : tab === "reminders" ? (
        <RemindersView />
      ) : tab === "pipeline" ? (
        <PipelineView />
      ) : null}
    </div>
  );
}
