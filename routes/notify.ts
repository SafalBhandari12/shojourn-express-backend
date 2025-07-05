import express, { Request, Response } from "express";
import NotifyEmail from "../models/NotifyEmail";

const router = express.Router();

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ message: "Email required" });
    return;
  }
  try {
    const existing = await NotifyEmail.findOne({ email });
    if (existing) {
      res.json({ message: "You are already in notify list" });
      return;
    }
    await NotifyEmail.create({ email });
    res.json({ message: "You will be notified" });
    return;
  } catch (err) {
    res.status(500).json({ message: "Server error" });
    return;
  }
});

export default router;
