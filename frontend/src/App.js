import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = process.env.REACT_APP_API;

// 🏷️ Label colors
const LABEL_COLORS = {
  "Hot Lead": "#FF6B6B",
  "Cold Lead": "#74C0FC",
  "Customer": "#51CF66",
  "VIP": "#FAB005",
  "": "#ccc"
};

// ⚡ Quick Reply Templates
const QUICK_REPLIES = [
  "नमस्कार! आम्ही लवकरच reply करतो 🙏",
  "धन्यवाद तुमच्या संदेशासाठी!",
  "कृपया थोडा वेळ थांबा, आम्ही check करतो.",
  "तुमची order confirm झाली ✅",
  "आजच आम्हाला call करा: 9XXXXXXXXX"
];

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

  // 🆕 Phase 1 states
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);

  const bottomRef = useRef();
  const typingTimeout = useRef(null);

  const loadContacts = async () => {
    const res = await axios.get(API + "/api/contacts");
    setContacts(res.data);
    setTotalCount(res.data.length);
  };

  useEffect(() => { loadContacts(); }, []);

  const openChat = async (contact) => {
    setActive(contact.phone);
    setActiveContact(contact);
    setNotesText(contact.notes || "");
    setNotesSaved(false);
    setShowProfile(false);
    setShowQuickReplies(false);

    const res = await axios.get(API + "/api/messages/" + contact.phone);
    setMessages(res.data);

    await axios.post(API + "/api/seen/" + contact.phone);
    socket.emit("join", contact.phone);

    // Update unread to 0 locally
    setContacts(prev =>
      prev.map(c => c.phone === contact.phone ? { ...c, unread: 0 } : c)
    );
  };

  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, msg]);
      loadContacts();
    });

    socket.on("typing", (phone) => {
      if (phone === active) setTyping(true);
    });

    socket.on("stop_typing", (phone) => {
      if (phone === active) setTyping(false);
    });

    socket.on("message_status", ({ phone, status }) => {
      setMessages(prev =>
        prev.map(m => m.phone === phone ? { ...m, status } : m)
      );
    });

    socket.on("contact_update", ({ phone, lastMessage }) => {
      setContacts(prev =>
        prev.map(c => c.phone === phone ? { ...c, lastMessage } : c)
      );
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
    if (!msg) return alert("Enter message");

    await axios.post(API + "/api/send", { phone: active, message: msg });

    setMessages(prev => [...prev, {
      phone: active, message: msg, direction: "outgoing",
      status: "sent", createdAt: new Date()
    }]);

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
    if (activeContact?.phone === phone) {
      setActiveContact(prev => ({ ...prev, label }));
    }
  };

  const saveNotes = async () => {
    await axios.post(API + "/api/notes/" + active, { notes: notesText });
    setContacts(prev => prev.map(c => c.phone === active ? { ...c, notes: notesText } : c));
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const exportCSV = () => {
    window.open(API + "/api/export-csv", "_blank");
  };

  // Filtered contacts
  const filtered = contacts
    .filter(c => tab === "chats" ? c.lastMessage : true)
    .filter(c => !labelFilter || c.label === labelFilter)
    .filter(c => !unreadFilter || c.unread > 0)
    .filter(c =>
      c.phone.includes(search) ||
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.lastMessage || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // Stats
  const totalUnread = contacts.filter(c => c.unread > 0).length;
  const hotLeads = contacts.filter(c => c.label === "Hot Lead").length;
  const customers = contacts.filter(c => c.label === "Customer").length;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', Arial, sans-serif", background: "#f0f2f5" }}>

      {/* ===== LEFT PANEL ===== */}
      <div style={{ width: "32%", borderRight: "1px solid #ddd", display: "flex", flexDirection: "column", background: "white" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", background: "#075E54", color: "white" }}>
          <div style={{ fontWeight: "bold", fontSize: 16 }}>📱 WhatsApp CRM</div>

          {/* Mini stats */}
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11 }}>
            <span>👥 {totalCount}</span>
            <span style={{ color: unreadFilter ? "#25D366" : "#ccc", cursor: "pointer" }}
              onClick={() => setUnreadFilter(!unreadFilter)}>
              🔴 {totalUnread} unread
            </span>
            <span>🔥 {hotLeads} hot</span>
            <span>✅ {customers} customers</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #eee" }}>
          {["chats", "contacts"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "10px 0", border: "none", background: "none",
              fontWeight: tab === t ? "bold" : "normal",
              borderBottom: tab === t ? "2px solid #075E54" : "none",
              cursor: "pointer", textTransform: "capitalize", fontSize: 13
            }}>
              {t === "chats" ? "💬 Chats" : "👥 Contacts"}
            </button>
          ))}
        </div>

        {/* Contacts tab features */}
        {tab === "contacts" && (
          <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa" }}>

            {/* Add contact */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}
                style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }} />
              <input placeholder="Phone (10 digits)" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }} />
              <button onClick={async () => {
                if (!newPhone) return alert("Enter phone");
                try {
                  await axios.post(API + "/api/add-contact", { name: newName, phone: newPhone });
                  setNewName(""); setNewPhone(""); loadContacts();
                } catch (err) {
                  alert(err.response?.data || "Error adding contact");
                }
              }} style={{
                padding: "6px 10px", background: "#075E54", color: "white",
                border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13
              }}>➕</button>
            </div>

            {/* CSV upload + Export */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <label style={{
                padding: "5px 10px", background: "#eee", borderRadius: 6,
                cursor: "pointer", fontSize: 12, border: "1px solid #ddd"
              }}>
                📂 CSV Upload
                <input type="file" accept=".csv" style={{ display: "none" }} onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    setUploadMsg("Uploading... ⏳");
                    const res = await axios.post(API + "/api/upload-csv", formData);
                    setUploadMsg(`✅ Added ${res.data.added}/${res.data.count}`);
                    loadContacts();
                  } catch { setUploadMsg("❌ Upload failed"); }
                }} />
              </label>

              <button onClick={exportCSV} style={{
                padding: "5px 10px", background: "#25D366", color: "white",
                border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12
              }}>
                📥 Export CSV
              </button>
            </div>

            {uploadMsg && <div style={{ fontSize: 11, marginTop: 4, color: "#555" }}>{uploadMsg}</div>}
          </div>
        )}

        {/* Label filter */}
        <div style={{ padding: "6px 10px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid #eee" }}>
          <span style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>Filter:</span>
          {["", "Hot Lead", "Cold Lead", "Customer", "VIP"].map(l => (
            <button key={l} onClick={() => setLabelFilter(l === labelFilter ? "" : l)} style={{
              padding: "2px 8px", borderRadius: 10, fontSize: 10, border: "1px solid #ddd",
              background: labelFilter === l && l ? LABEL_COLORS[l] : labelFilter === l ? "#eee" : "white",
              color: labelFilter === l && l ? "white" : "#333",
              cursor: "pointer"
            }}>
              {l || "All"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "8px 10px" }}>
          <input placeholder="🔍 Search name, phone, message..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 20, fontSize: 13, boxSizing: "border-box" }} />
        </div>

        {/* Contact list */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: "#aaa", padding: 20, fontSize: 13 }}>No contacts found</div>
          )}

          {filtered.map(c => (
            <div key={c.phone} onClick={() => openChat(c)}
              style={{
                padding: "10px 14px", cursor: "pointer",
                background: active === c.phone ? "#f0f7f0" : "white",
                borderBottom: "1px solid #f0f0f0",
                borderLeft: active === c.phone ? "3px solid #075E54" : "3px solid transparent"
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {/* Avatar + Name */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", background: "#075E54",
                    color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "bold", fontSize: 14, flexShrink: 0
                  }}>
                    {(c.name || c.phone).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "600", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name && c.name !== "" ? c.name : c.phone}
                    </div>
                    <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.lastMessage || "No messages yet"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  {c.unread > 0 && (
                    <span style={{
                      background: "#25D366", color: "white", padding: "1px 6px",
                      borderRadius: 10, fontSize: 10, fontWeight: "bold"
                    }}>{c.unread}</span>
                  )}
                  {c.label && (
                    <span style={{
                      background: LABEL_COLORS[c.label], color: "white",
                      padding: "1px 6px", borderRadius: 10, fontSize: 9
                    }}>{c.label}</span>
                  )}
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm("Delete this contact?")) return;
                    await axios.delete(API + "/api/delete-contact/" + c.phone);
                    if (active === c.phone) { setActive(null); setActiveContact(null); }
                    loadContacts();
                  }} style={{
                    background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#aaa"
                  }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== RIGHT PANEL ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Chat Header */}
        <div style={{ padding: "12px 16px", background: "#075E54", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {activeContact ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%", background: "#128C7E",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: "bold", fontSize: 16
              }}>
                {(activeContact.name || activeContact.phone).charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: "bold", fontSize: 15 }}>
                  {activeContact.name && activeContact.name !== "" ? activeContact.name : activeContact.phone}
                </div>
                <div style={{ fontSize: 11, color: "#d4f8e8" }}>
                  {activeContact.name ? activeContact.phone : ""}
                  {typing && " • typing..."}
                </div>
              </div>
              {activeContact.label && (
                <span style={{
                  background: LABEL_COLORS[activeContact.label],
                  padding: "2px 8px", borderRadius: 10, fontSize: 11
                }}>{activeContact.label}</span>
              )}
            </div>
          ) : (
            <div style={{ fontWeight: "bold" }}>💬 Select a chat</div>
          )}

          {activeContact && (
            <button onClick={() => setShowProfile(!showProfile)} style={{
              background: "rgba(255,255,255,0.2)", border: "none", color: "white",
              padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12
            }}>
              {showProfile ? "✕ Close" : "👤 Profile"}
            </button>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Messages area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, padding: 12, overflowY: "auto", background: "#ECE5DD", display: "flex", flexDirection: "column" }}>

              {!active && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 14 }}>
                  👈 Select a contact to start chatting
                </div>
              )}

              {messages.map((m, i) => {
                const curr = m.createdAt ? new Date(m.createdAt).toDateString() : null;
                const prev = i > 0 && messages[i - 1].createdAt ? new Date(messages[i - 1].createdAt).toDateString() : null;
                const showDivider = curr && curr !== prev;

                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                    {showDivider && (
                      <div style={{ textAlign: "center", margin: "10px 0", fontSize: 11, color: "#555" }}>
                        <span style={{ background: "rgba(255,255,255,0.7)", padding: "2px 10px", borderRadius: 10 }}>
                          {formatDateDivider(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <div style={{
                      maxWidth: "60%", padding: "8px 12px", margin: "3px 6px",
                      borderRadius: m.direction === "outgoing" ? "15px 15px 4px 15px" : "15px 15px 15px 4px",
                      background: m.direction === "outgoing" ? "#DCF8C6" : "#fff",
                      alignSelf: m.direction === "outgoing" ? "flex-end" : "flex-start",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
                    }}>
                      {m.media ? (
                        m.mimeType?.startsWith("image") ? (
                          <img src={API + "/uploads/" + m.message} width="200" style={{ borderRadius: 8 }} alt="media" />
                        ) : m.mimeType?.startsWith("audio") ? (
                          <audio controls src={API + "/uploads/" + m.message} style={{ width: 200 }} />
                        ) : (
                          <a href={API + "/uploads/" + m.message} target="_blank" rel="noreferrer" style={{ color: "#075E54" }}>📎 File</a>
                        )
                      ) : m.message}
                      <div style={{ fontSize: 10, color: "#888", textAlign: "right", marginTop: 2 }}>
                        {formatTime(m.createdAt)} {m.direction === "outgoing" ? (m.status === "seen" ? "✔✔" : "✔") : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef}></div>
            </div>

            {/* Input area */}
            {active && (
              <div style={{ background: "#f0f0f0", borderTop: "1px solid #ddd" }}>

                {/* Quick Replies Popup */}
                {showQuickReplies && (
                  <div style={{ padding: "8px 12px", background: "white", borderTop: "1px solid #eee" }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>⚡ Quick Replies</div>
                    {QUICK_REPLIES.map((qr, i) => (
                      <div key={i} onClick={() => sendMsg(qr)} style={{
                        padding: "6px 10px", background: "#f5f5f5", borderRadius: 8,
                        marginBottom: 4, cursor: "pointer", fontSize: 12,
                        border: "1px solid #eee"
                      }}>{qr}</div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", padding: "8px 10px", gap: 6, alignItems: "center" }}>
                  {/* Quick reply button */}
                  <button onClick={() => setShowQuickReplies(!showQuickReplies)} title="Quick Replies" style={{
                    background: showQuickReplies ? "#075E54" : "white", color: showQuickReplies ? "white" : "#555",
                    border: "1px solid #ddd", borderRadius: 20, padding: "8px 10px", cursor: "pointer", fontSize: 14
                  }}>⚡</button>

                  {/* File input */}
                  <label style={{
                    background: "white", border: "1px solid #ddd", borderRadius: 20,
                    padding: "8px 10px", cursor: "pointer", fontSize: 14, color: "#555"
                  }} title="Attach file">
                    📎
                    <input type="file" style={{ display: "none" }} onChange={sendFile} />
                  </label>

                  <input
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      socket.emit("typing", active);
                      clearTimeout(typingTimeout.current);
                      typingTimeout.current = setTimeout(() => {
                        socket.emit("stop_typing", active);
                      }, 1000);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendMsg(); }}
                    placeholder="Type a message..."
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid #ddd", fontSize: 13, outline: "none" }}
                  />

                  <button onClick={() => sendMsg()} style={{
                    background: "#075E54", color: "white", border: "none",
                    borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 16
                  }}>➤</button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Panel */}
          {showProfile && activeContact && (
            <div style={{ width: 260, background: "white", borderLeft: "1px solid #ddd", overflowY: "auto" }}>
              <div style={{ padding: 16, background: "#075E54", color: "white", textAlign: "center" }}>
                <div style={{
                  width: 60, height: 60, borderRadius: "50%", background: "#128C7E",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "bold", fontSize: 24, margin: "0 auto 8px"
                }}>
                  {(activeContact.name || activeContact.phone).charAt(0).toUpperCase()}
                </div>
                <div style={{ fontWeight: "bold", fontSize: 15 }}>
                  {activeContact.name || "No Name"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{activeContact.phone}</div>
              </div>

              <div style={{ padding: 14 }}>

                {/* Label */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: "#555", marginBottom: 6 }}>🏷️ Label</div>
                  <select
                    value={activeContact.label || ""}
                    onChange={(e) => updateLabel(activeContact.phone, e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12 }}
                  >
                    <option value="">None</option>
                    <option value="Hot Lead">🔥 Hot Lead</option>
                    <option value="Cold Lead">❄️ Cold Lead</option>
                    <option value="Customer">✅ Customer</option>
                    <option value="VIP">⭐ VIP</option>
                  </select>
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: "#555", marginBottom: 6 }}>📝 Notes</div>
                  <textarea
                    value={notesText}
                    onChange={(e) => { setNotesText(e.target.value); setNotesSaved(false); }}
                    placeholder="Add notes about this contact..."
                    rows={5}
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                  />
                  <button onClick={saveNotes} style={{
                    width: "100%", padding: "7px 0", background: notesSaved ? "#25D366" : "#075E54",
                    color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, marginTop: 4
                  }}>
                    {notesSaved ? "✅ Saved!" : "💾 Save Notes"}
                  </button>
                </div>

                {/* Contact info */}
                <div style={{ fontSize: 12, color: "#888" }}>
                  <div style={{ marginBottom: 4 }}>📅 Added: {activeContact.createdAt ? new Date(activeContact.createdAt).toLocaleDateString() : "-"}</div>
                  <div>💬 Last message: {activeContact.lastMessage || "None"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
