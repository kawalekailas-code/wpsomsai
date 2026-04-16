import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = process.env.REACT_APP_API;

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);

  const bottomRef = useRef();

  const loadContacts = async () => {
    const res = await axios.get(API + "/api/contacts");
    setContacts(res.data);
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const openChat = async (phone) => {
    setActive(phone);

    const res = await axios.get(API + "/api/messages/" + phone);
    setMessages(res.data);

    await axios.post(API + "/api/seen/" + phone);

    socket.emit("join", phone);
  };

  // 🔥 SOCKET EVENTS
  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, msg]);
      loadContacts();
    });

    socket.on("typing", () => setTyping(true));
    socket.on("stop_typing", () => setTyping(false));

    socket.on("message_status", ({ phone, status }) => {
      setMessages(prev =>
        prev.map(m =>
          m.phone === phone ? { ...m, status } : m
        )
      );
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 🔥 SEND TEXT
  const sendMsg = async () => {
    console.log("CLICKED", text, active);

    if (!active) {
      alert("❌ First select chat");
      return;
    }

    if (!text) {
      alert("❌ Enter message");
      return;
    }

    try {
      await axios.post(API + "/api/send", {
        phone: active,
        message: text
      });

      setMessages(prev => [...prev, {
        phone: active,
        message: text,
        direction: "outgoing",
        status: "sent"
      }]);

      setText("");
      socket.emit("stop_typing", active);

    } catch (err) {
      console.log("SEND ERROR:", err);
      alert("Send failed");
    }
  };

  // 🔥 SEND MEDIA
  const sendFile = async (e) => {
    const file = e.target.files[0];

    if (!active) {
      alert("Select chat first");
      return;
    }

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("phone", active);

    try {
      await axios.post(API + "/api/send/media", formData);

      setMessages(prev => [...prev, {
        phone: active,
        message: "Uploading...",
        direction: "outgoing",
        media: true,
        mimeType: file.type
      }]);

    } catch (err) {
      console.log("MEDIA ERROR:", err);
      alert("Media send failed");
    }
  };

  const filtered = contacts
    .filter(c =>
      c.phone.includes(search) ||
      (c.lastMessage || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial" }}>

      {/* LEFT PANEL */}
      <div style={{ width: "30%", borderRight: "1px solid #ddd", overflowY: "auto" }}>
        <div style={{ padding: 15, background: "#075E54", color: "white", fontWeight: "bold" }}>
          WhatsApp CRM
        </div>

        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "95%", margin: 10, padding: 8 }}
        />

        {filtered.map(c => (
          <div
            key={c.phone}
            onClick={() => openChat(c.phone)}
            style={{
              padding: 10,
              cursor: "pointer",
              background: active === c.phone ? "#eee" : "white",
              borderBottom: "1px solid #eee"
            }}
          >
            <b>{c.phone}</b>
            <div style={{ fontSize: 12 }}>{c.lastMessage}</div>

            {c.unread > 0 && (
              <span style={{
                background: "green",
                color: "white",
                padding: "2px 6px",
                borderRadius: 10,
                fontSize: 10
              }}>
                {c.unread}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 15, background: "#075E54", color: "white" }}>
          {active || "Select chat"}
          {typing && <div style={{ fontSize: 12 }}>Typing...</div>}
        </div>

        <div style={{
          flex: 1,
          padding: 10,
          overflowY: "auto",
          background: "#ECE5DD",
          display: "flex",
          flexDirection: "column"
        }}>
          {messages.map((m, i) => (
            <div key={i}
              style={{
                maxWidth: "60%",
                padding: "8px 12px",
                margin: "5px",
                borderRadius: "15px",
                background: m.direction === "outgoing" ? "#DCF8C6" : "#fff",
                alignSelf: m.direction === "outgoing" ? "flex-end" : "flex-start",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
              }}
            >
              {m.media ? (
                m.mimeType?.startsWith("image") ? (
                  <img src={API + "/uploads/" + m.message} width="200" />
                ) : (
                  <a href={API + "/uploads/" + m.message}>📎 File</a>
                )
              ) : (
                m.message
              )}

              <div style={{ fontSize: 10 }}>
                {m.status === "seen" ? "✔✔" : "✔"}
              </div>
            </div>
          ))}
          <div ref={bottomRef}></div>
        </div>

        {active && (
          <div style={{
            display: "flex",
            padding: 10,
            background: "#f0f0f0",
            position: "relative",
            zIndex: 10   // 🔥 FIX
          }}>
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                socket.emit("typing", active);
              }}
              style={{ flex: 1, padding: 10 }}
              placeholder="Type message..."
            />

            <input type="file" onChange={sendFile} />

            <button
              onClick={() => sendMsg()}
              style={{
                background: "#25D366",
                color: "white",
                border: "none",
                padding: "10px 15px",
                cursor: "pointer"
              }}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
