import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import User from "../models/User";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "user" | "vendor" | "adventurer" | "admin" | "renter";
  };
}

const vendorMiddleware = async (
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

    if (user.role !== "vendor" && user.role !== "admin") {
      res
        .status(403)
        .json({ error: "Access denied. Vendor privileges required" });
      return;
    }

    next();
  } catch (error) {
    console.error("Vendor middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export default vendorMiddleware;
