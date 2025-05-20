// Migrated to TypeScript
import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  mobile: string;
  name?: string;
  address?: string;
  password?: string;
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  role: "client" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
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
    role: { type: String, enum: ["client", "admin"], default: "client" },
  },
  { timestamps: true }
);

UserSchema.virtual("id").get(function (this: IUser) {
  return this._id.toHexString();
});

UserSchema.set("toJSON", { virtuals: true });

export default mongoose.model<IUser>("User", UserSchema);
