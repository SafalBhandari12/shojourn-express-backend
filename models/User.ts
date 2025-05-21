// Migrated to TypeScript
import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export interface IUser extends Document {
  mobile: string;
  name?: string;
  address?: string;
  password?: string;
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  role: "client" | "vendor" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthToken(): string;
}

const UserSchema = new Schema<IUser>(
  {
    mobile: { type: String, required: true, unique: true },
    name: { type: String },
    address: { type: String },
    password: { type: String },
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
    role: {
      type: String,
      enum: ["client", "vendor", "admin"],
      default: "client",
    },
  },
  { timestamps: true }
);

UserSchema.virtual("id").get(function (this: IUser) {
  return this._id.toHexString();
});

UserSchema.set("toJSON", { virtuals: true });

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(this.password, salt);
    this.password = hashedPassword;
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
UserSchema.methods.generateAuthToken = function (): string {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined");
  }
  return jwt.sign(
    { user: { id: this._id, role: this.role } },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );
};

export default mongoose.model<IUser>("User", UserSchema);
