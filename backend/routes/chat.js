import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();

router.get("/contacts", async (req, res) => {
  res.json(await Contact.find().sort({ _id: -1 }));
});

router.get("/messages/:phone", async (req, res) => {
  res.json(await Message.find({ phone: req.params.phone }));
});

export default router;