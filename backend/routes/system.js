import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { asyncRoute } from "../lib/utils.js";
import { systemUsage } from "../services/system-usage.js";
const router = express.Router();
router.use(requireAdmin);
router.get("/usage", asyncRoute(async (req, res) => {
  res.json(await systemUsage({ traffic: req.app.locals.traffic, io: req.io }));
}));
export default router;
