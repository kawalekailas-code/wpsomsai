router.post("/", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (msg) {
      const phone = msg.from;
      const text = msg.text?.body || "";

      await Message.create({ phone, message: text, direction: "incoming" });

      let contact = await Contact.findOne({ phone });
      if (!contact) contact = await Contact.create({ phone });

      contact.lastMessage = text;
      await contact.save();

      req.io?.to(phone).emit("new_message", {
        phone,
        message: text,
        direction: "incoming"
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.log("Webhook error:", err);
    res.sendStatus(200); // IMPORTANT
  }
});
