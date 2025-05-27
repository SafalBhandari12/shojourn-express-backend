// Migrated to TypeScript
import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export interface IUser extends Document {
  name: string;
  mobile: string;
  role: "user" | "vendor" | "adventurer" | "admin";
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  address?: string;
  generateAuthToken(): string;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ["user", "vendor", "adventurer", "admin"],
      default: "user",
    },
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
    address: { type: String },
  },
  { timestamps: true }
);

// Create indexes
UserSchema.index({ mobile: 1 }, { unique: true });

// Generate JWT token
UserSchema.methods.generateAuthToken = function (): string {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "7d" }
  );
};

export default mongoose.model<IUser>("User", UserSchema);
