import { Types } from "mongoose";
import { Request as ExpressRequest } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string | Types.ObjectId;
        role: "user" | "vendor" | "adventurer" | "admin" | "renter";
      };
      files?: {
        [fieldname: string]: Express.Multer.File[];
      };
    }
  }
}

export interface RequestWithFiles extends ExpressRequest {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
  body: {
    name?: string;
    description?: string;
    detailedDescription?: string;
    price?: string;
    origin?: string;
    usageInstructions?: string;
    careInstructions?: string;
    nutritionalInfo?: string;
    category?: string;
    stock?: string;
    discount?: {
      percentage: string;
      validFrom: string;
      validUntil: string;
    };
    percentage?: string;
    validFrom?: string;
    validUntil?: string;
    items?: Array<{
      productId: string;
      quantity: number;
    }>;
    shippingAddress?: string;
    paymentMethod?: string;
    status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  };
}

export interface RequestWithUser extends ExpressRequest {
  user: {
    id: string | Types.ObjectId;
    role: "user" | "vendor" | "adventurer" | "admin" | "renter";
  };
}

export {};
