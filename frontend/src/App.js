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

  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, msg]);
      loadContacts();
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMsg = async () => {
    if (!text) return;

    await axios.post(API + "/api/send", {
      phone: active,
      message: text
    });

    setMessages(prev => [...prev, {
      message: text,
      direction: "outgoing",
      status: "sent"
    }]);

    setText("");
  };

  const filtered = contacts
    .filter(c =>
      c.phone.includes(search) ||
      (c.lastMessage || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial" }}>

      {/* LEFT */}
      <div style={{ width: "30%", borderRight: "1px solid #ddd", overflowY: "auto" }}>
        <div style={{ padding: 10, background: "#075E54", color: "white" }}>
          WhatsApp CRM
        </div>

        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "95%", margin: 10, padding: 5 }}
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

      {/* RIGHT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 10, background: "#075E54", color: "white" }}>
          {active || "Select chat"}
        </div>

        <div style={{
          flex: 1,
          padding: 10,
          overflowY: "auto",
          background: "#ECE5DD"
        }}>
          {messages.map((m, i) => (
            <div key={i}
              style={{
                maxWidth: "60%",
                padding: 10,
                margin: "5px 0",
                borderRadius: 10,
                background: m.direction === "outgoing" ? "#DCF8C6" : "white",
                alignSelf: m.direction === "outgoing" ? "flex-end" : "flex-start"
              }}
            >
              {m.message}

              <div style={{ fontSize: 10 }}>
                {m.status === "seen" ? "✔✔" : "✔"}
              </div>
            </div>
          ))}
          <div ref={bottomRef}></div>
        </div>

        {active && (
          <div style={{ display: "flex", padding: 10 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ flex: 1, padding: 10 }}
            />
            <button onClick={sendMsg}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
