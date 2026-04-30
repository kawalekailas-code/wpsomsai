import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import Message from "../models/Message.js";
import Contact from "../models/Contact.js";

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Helper: Get last N messages for a contact
const getHistory = async (phone, limit = 20) => {
  const msgs = await Message.find({ phone }).sort({ createdAt: -1 }).limit(limit);
  return msgs.reverse().map(m =>
    `[${m.direction === "outgoing" ? "You" : "Customer"}]: ${m.message}`
  ).join("\n");
};


// 💡 AI REPLY SUGGESTIONS
// Input: phone
// Output: 3 suggested replies based on last messages
router.post("/suggest-reply", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).send("Phone required");

    const history = await getHistory(phone, 15);
    if (!history) return res.json({ suggestions: ["Hello! How can I help you?"] });

    const contact = await Contact.findOne({ phone });
    const name = contact?.name || "Customer";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are a WhatsApp business assistant. Based on this conversation with ${name}, suggest 3 short, natural reply options in the SAME LANGUAGE as the customer used (Marathi, Hindi, or English). Each reply should be on a new line starting with "- ". Keep each reply under 30 words.

Conversation:
${history}

Give only 3 reply suggestions, nothing else.`
      }]
    });

    const text = response.content[0].text;
    const suggestions = text
      .split("\n")
      .filter(l => l.startsWith("- "))
      .map(l => l.replace("- ", "").trim())
      .slice(0, 3);

    res.json({ suggestions: suggestions.length ? suggestions : [text] });
  } catch (err) {
    console.log("AI suggest error:", err);
    res.status(500).send("AI error");
  }
});


// 📋 CONTACT SUMMARY
// Input: phone
// Output: summary of entire conversation
router.post("/summarize", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).send("Phone required");

    const history = await getHistory(phone, 50);
    if (!history) return res.json({ summary: "No conversation history found." });

    const contact = await Contact.findOne({ phone });
    const name = contact?.name || phone;
    const label = contact?.label || "No label";
    const notes = contact?.notes || "No notes";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Summarize this WhatsApp conversation with ${name} (Label: ${label}, Notes: ${notes}) in clear bullet points. Include:
- What they asked/discussed
- Key decisions or outcomes
- Any pending follow-ups
- Overall sentiment (positive/neutral/negative)

Keep it under 150 words. Use simple English.

Conversation:
${history}`
      }]
    });

    res.json({ summary: response.content[0].text });
  } catch (err) {
    console.log("AI summarize error:", err);
    res.status(500).send("AI error");
  }
});


// 😊 SENTIMENT ANALYSIS
// Input: phone
// Output: sentiment score + breakdown
router.post("/sentiment", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).send("Phone required");

    const history = await getHistory(phone, 20);
    if (!history) return res.json({ sentiment: "neutral", score: 50, reason: "No messages" });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Analyze the customer's sentiment in this WhatsApp conversation. Reply ONLY with JSON in this exact format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": 0-100,
  "emoji": "😊" | "😐" | "😠",
  "reason": "one short sentence explanation",
  "intent": "buying" | "complaining" | "inquiring" | "support" | "other"
}

Conversation:
${history}`
      }]
    });

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(clean);
    res.json(data);
  } catch (err) {
    console.log("AI sentiment error:", err);
    res.status(500).json({ sentiment: "neutral", score: 50, emoji: "😐", reason: "Could not analyze", intent: "other" });
  }
});


// ✍️ AI MESSAGE COMPOSER
// Input: prompt (what you want to say), tone, language
// Output: polished WhatsApp message
router.post("/compose", async (req, res) => {
  try {
    const { prompt, tone = "friendly", language = "English", phone } = req.body;
    if (!prompt) return res.status(400).send("Prompt required");

    let context = "";
    if (phone) {
      const history = await getHistory(phone, 10);
      context = history ? `\nPrevious conversation context:\n${history}\n` : "";
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Write a WhatsApp business message in ${language} with a ${tone} tone.
${context}
What to say: ${prompt}

Rules:
- Keep it natural and conversational
- Under 100 words
- No subject line, just the message body
- Use emojis if friendly/casual tone

Reply with ONLY the message text, nothing else.`
      }]
    });

    res.json({ message: response.content[0].text.trim() });
  } catch (err) {
    console.log("AI compose error:", err);
    res.status(500).send("AI error");
  }
});


// 🌐 TRANSLATE MESSAGE
// Input: text, targetLang
// Output: translated text
router.post("/translate", async (req, res) => {
  try {
    const { text, targetLang = "English" } = req.body;
    if (!text) return res.status(400).send("Text required");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Translate this WhatsApp message to ${targetLang}. Reply with ONLY the translated text, nothing else.\n\n"${text}"`
      }]
    });

    res.json({ translated: response.content[0].text.trim() });
  } catch (err) {
    console.log("AI translate error:", err);
    res.status(500).send("AI error");
  }
});


// 🤖 AUTO REPLY GENERATOR
// Input: incoming message text
// Output: suggested auto-reply
router.post("/auto-reply", async (req, res) => {
  try {
    const { message, businessName = "our business" } = req.body;
    if (!message) return res.status(400).send("Message required");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `A customer sent this WhatsApp message to ${businessName}: "${message}"

Write a short, friendly auto-reply in the SAME LANGUAGE as the customer message. The reply should acknowledge their message and let them know someone will respond soon. Keep it under 50 words. Reply with ONLY the message.`
      }]
    });

    res.json({ reply: response.content[0].text.trim() });
  } catch (err) {
    console.log("AI auto-reply error:", err);
    res.status(500).send("AI error");
  }
});


export default router;
