import { Types } from "mongoose";

declare global {
  namespace Express {
    // This is what tells Express about our custom user property
    interface Request {
      user?: {
        id: Types.ObjectId | string;
        role: "client" | "admin";
      };
    }
  }
}

export {};
