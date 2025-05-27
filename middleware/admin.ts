// Migrated to TypeScript
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import User from "../models/User";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "user" | "vendor" | "adventurer" | "admin";
  };
}

export const admin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (user.role !== "admin") {
      res
        .status(403)
        .json({ error: "Access denied. Admin privileges required" });
      return;
    }

    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
