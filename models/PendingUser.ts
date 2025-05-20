// Migrated to TypeScript
import mongoose, { Document, Schema } from "mongoose";

export interface IPendingUser extends Document {
  mobile: string;
  name: string;
  address: string;
  otp: string;
  otpExpires: Date;
}

const PendingUserSchema = new Schema<IPendingUser>({
  mobile: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
});

PendingUserSchema.virtual("id").get(function (this: IPendingUser) {
  return this._id.toHexString();
});

PendingUserSchema.set("toJSON", { virtuals: true });

export default mongoose.model<IPendingUser>("PendingUser", PendingUserSchema);
