// Migrated to TypeScript
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { Types } from "mongoose";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "client" | "vendor" | "admin";
  };
}

export const auth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      user: { id: string; role: "client" | "vendor" | "admin" };
    };

    const user = await User.findById(decoded.user.id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = decoded.user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid token" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
