import express from "express";
import axios from "axios";
import Template from "../models/Template.js";
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();

// ==================== TEMPLATES ====================

// GET all templates
router.get("/templates", async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: "Error fetching templates" });
  }
});

// CREATE template
router.post("/templates", async (req, res) => {
  try {
    const { name, category, language, body, header, footer, variables, waTemplateName } = req.body;
    if (!name || !body) return res.status(400).json({ error: "Name and body required" });

    const template = await Template.create({
      name, category, language, body,
      header: header || "",
      footer: footer || "",
      variables: variables || [],
      waTemplateName: waTemplateName || "",
      createdBy: req.user?.username || ""
    });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: "Error creating template" });
  }
});

// UPDATE template
router.put("/templates/:id", async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: "Error updating template" });
  }
});

// DELETE template
router.delete("/templates/:id", async (req, res) => {
  try {
    await Template.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error deleting template" });
  }
});

// ==================== CAMPAIGNS ====================

// GET all campaigns (with stats)
router.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .select("-recipients") // recipients array exclude (heavy)
      .sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Error fetching campaigns" });
  }
});

// GET single campaign (with recipients)
router.get("/campaigns/:id", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: "Error fetching campaign" });
  }
});

// CREATE & SEND campaign
router.post("/campaigns", async (req, res) => {
  try {
    const {
      name, templateId, message,
      phones,          // manual phone list
      labelFilter,     // label नुसार contacts
      useWaTemplate,
      waTemplateName,
      variables        // { "1": "John", "2": "500" }
    } = req.body;

    if (!name || !message) return res.status(400).json({ error: "Name and message required" });

    // Recipients बनवा
    let recipientPhones = phones || [];

    // Label filter असेल तर contacts fetch करा
    if (labelFilter !== undefined && labelFilter !== null) {
      const query = labelFilter ? { label: labelFilter } : {};
      const contacts = await Contact.find(query, "phone name");
      const filtered = contacts.filter(c => !recipientPhones.includes(c.phone));
      recipientPhones = [...recipientPhones, ...contacts.map(c => c.phone)];
    }

    if (!recipientPhones.length) return res.status(400).json({ error: "No recipients selected" });

    // Recipient objects बनवा
    const recipients = await Promise.all(recipientPhones.map(async (phone) => {
      const contact = await Contact.findOne({ phone });
      return { phone, name: contact?.name || phone, status: "pending" };
    }));

    // Campaign save करा
    const campaign = await Campaign.create({
      name,
      templateId: templateId || null,
      message,
      useWaTemplate: useWaTemplate || false,
      waTemplateName: waTemplateName || "",
      recipients,
      totalCount: recipients.length,
      sentCount: 0,
      failedCount: 0,
      status: "running",
      startedAt: new Date(),
      labelFilter: labelFilter || "",
      createdBy: req.user?.username || ""
    });

    // Response पाठवा — sending background मध्ये
    res.json({
      success: true,
      campaignId: campaign._id,
      total: recipients.length,
      message: `Campaign "${name}" started for ${recipients.length} contacts`
    });

    // Background मध्ये messages पाठवा
    sendCampaign(campaign, variables || {});

  } catch (err) {
    console.log("Campaign error:", err);
    res.status(500).json({ error: "Error creating campaign" });
  }
});

// DELETE campaign
router.delete("/campaigns/:id", async (req, res) => {
  try {
    await Campaign.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error deleting campaign" });
  }
});

// CAMPAIGN STATS summary
router.get("/stats", async (req, res) => {
  try {
    const total = await Campaign.countDocuments();
    const completed = await Campaign.countDocuments({ status: "completed" });
    const running = await Campaign.countDocuments({ status: "running" });

    const agg = await Campaign.aggregate([
      { $group: {
        _id: null,
        totalSent: { $sum: "$sentCount" },
        totalFailed: { $sum: "$failedCount" },
        totalRecipients: { $sum: "$totalCount" }
      }}
    ]);

    const totals = agg[0] || { totalSent: 0, totalFailed: 0, totalRecipients: 0 };

    res.json({ total, completed, running, ...totals });
  } catch (err) {
    res.status(500).json({ error: "Stats error" });
  }
});

// ==================== BACKGROUND SENDER ====================

async function sendCampaign(campaign, variables) {
  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < campaign.recipients.length; i++) {
    const recipient = campaign.recipients[i];
    
    try {
      // Message मध्ये variables replace करा
      let finalMessage = campaign.message;
      
      // Contact specific variables (name वगैरे)
      const contact = await Contact.findOne({ phone: recipient.phone });
      finalMessage = finalMessage
        .replace(/{{name}}/gi, contact?.name || recipient.name || "Customer")
        .replace(/{{phone}}/gi, recipient.phone);

      // Custom variables replace करा {{1}}, {{2}} etc
      Object.entries(variables).forEach(([key, val]) => {
        finalMessage = finalMessage.replace(new RegExp(`{{${key}}}`, "g"), val);
      });

      if (campaign.useWaTemplate && campaign.waTemplateName) {
        // WhatsApp approved template पाठवा
        await axios.post(
          `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: recipient.phone,
            type: "template",
            template: {
              name: campaign.waTemplateName,
              language: { code: "en" }
            }
          },
          { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
      } else {
        // Regular text message
        await axios.post(
          `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: recipient.phone,
            type: "text",
            text: { body: finalMessage }
          },
          { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
      }

      // Message save करा
      await Message.create({
        phone: recipient.phone,
        message: finalMessage,
        direction: "outgoing",
        status: "sent"
      });

      // Contact last message update
      await Contact.updateOne(
        { phone: recipient.phone },
        { lastMessage: finalMessage.substring(0, 100), updatedAt: new Date() }
      );

      campaign.recipients[i].status = "sent";
      campaign.recipients[i].sentAt = new Date();
      sentCount++;

    } catch (err) {
      console.log(`Campaign send failed for ${recipient.phone}:`, err.message);
      campaign.recipients[i].status = "failed";
      campaign.recipients[i].error = err.response?.data?.error?.message || err.message;
      failedCount++;
    }

    // Progress save करा (दर 5 messages)
    if (i % 5 === 0 || i === campaign.recipients.length - 1) {
      await Campaign.updateOne(
        { _id: campaign._id },
        { sentCount, failedCount, recipients: campaign.recipients }
      );
    }

    // Rate limit: 1.2 second delay
    if (i < campaign.recipients.length - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // Campaign complete
  await Campaign.updateOne(
    { _id: campaign._id },
    {
      status: "completed",
      completedAt: new Date(),
      sentCount,
      failedCount,
      recipients: campaign.recipients
    }
  );

  console.log(`✅ Campaign "${campaign.name}" done: ${sentCount} sent, ${failedCount} failed`);
}

export default router;
