import { useEffect, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API;

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    axios.get(API + "/api/contacts").then(res => setContacts(res.data));
  }, []);

  const openChat = async (phone) => {
    setActive(phone);
    const res = await axios.get(API + "/api/messages/" + phone);
    setMessages(res.data);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      {/* LEFT PANEL */}
      <div style={{ width: "30%", borderRight: "1px solid #ccc" }}>
        <h3 style={{ padding: 10 }}>Chats</h3>
        {contacts.map(c => (
          <div
            key={c.phone}
            onClick={() => openChat(c.phone)}
            style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee" }}
          >
            <b>{c.phone}</b><br/>
            <small>{c.lastMessage}</small>
          </div>
        ))}
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, padding: 20 }}>
        {active ? (
          <>
            <h3>{active}</h3>
            {messages.map((m, i) => (
              <div key={i}>{m.message}</div>
            ))}
          </>
        ) : (
          <h3>Select a chat</h3>
        )}
      </div>

    </div>
  );
}
