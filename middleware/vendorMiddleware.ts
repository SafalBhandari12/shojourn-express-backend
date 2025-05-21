import { Request, Response, NextFunction, RequestHandler } from "express";
import User from "../models/User";
import { Types } from "mongoose";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "client" | "vendor" | "admin";
  };
}

const vendorMiddleware: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ msg: "No token, authorization denied" });
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(401).json({ msg: "User not found" });
      return;
    }

    if (user.role !== "vendor" && user.role !== "admin") {
      res
        .status(403)
        .json({ msg: "Access denied. Vendor privileges required." });
      return;
    }

    next();
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};

export default vendorMiddleware;
