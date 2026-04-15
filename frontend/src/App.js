import { useEffect, useState } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = process.env.REACT_APP_API;

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [phone, setPhone] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  useEffect(() => {
    axios.get(API + "/api/contacts").then(res => setContacts(res.data));
  }, []);

  const openChat = async (p) => {
    setPhone(p);
    const res = await axios.get(API + "/api/messages/" + p);
    setMessages(res.data);
    socket.emit("join", p);
  };

  useEffect(() => {
    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, msg]);
    });
  }, []);

  const sendMsg = async () => {
    await axios.post(API + "/api/send", { phone, message: text });
    setMessages(prev => [...prev, { message: text, direction: "outgoing" }]);
    setText("");
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: "30%" }}>
        {contacts.map(c => (
          <div key={c.phone} onClick={() => openChat(c.phone)}>
            {c.name || c.phone}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        {messages.map((m, i) => (
          <div key={i}>{m.message}</div>
        ))}

        {phone && (
          <>
            <input value={text} onChange={e => setText(e.target.value)} />
            <button onClick={sendMsg}>Send</button>
          </>
        )}
      </div>
    </div>
  );
}