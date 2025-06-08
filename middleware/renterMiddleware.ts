import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import User from "../models/User";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "user" | "vendor" | "adventurer" | "admin" | "renter";
  };
}

const renterMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== "renter" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Access denied. Renter role required" });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export default renterMiddleware;
