// Migrated to TypeScript
import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Rental, { IRental } from "./Rental"; // Import the Rental model

export interface IUser extends Document {
  name: string;
  mobile: string;
  role: "user" | "vendor" | "adventurer" | "admin" | "renter";
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
      enum: ["user", "vendor", "adventurer", "admin", "renter"],
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

// Add a pre-middleware to delete associated rentals when a user is removed
// This middleware will run when findByIdAndDelete or deleteOne is called on a User document
UserSchema.pre<any>(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    const user = this; // The user document being deleted
    try {
      // Delete all rentals where this user is the renter
      await Rental.deleteMany({ renter: user._id });
      console.log(`Deleted rentals for user ${user._id} (renter)`);
      next(); // Proceed with user deletion
    } catch (error: any) {
      console.error(`Error deleting rentals for user ${user._id}:`, error);
      next(error); // Pass the error to stop user deletion
    }
  }
);

export default mongoose.model<IUser>("User", UserSchema);
