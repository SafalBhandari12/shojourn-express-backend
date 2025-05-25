import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAdventureBooking extends Document {
  adventure: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  bookingDate: Date;
  numberOfParticipants: number;
  totalPrice: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  paymentStatus: "pending" | "paid" | "refunded";
  participants: {
    name: string;
    age: number;
    contactNumber: string;
  }[];
  specialRequirements?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AdventureBookingSchema = new Schema<IAdventureBooking>(
  {
    adventure: {
      type: Schema.Types.ObjectId,
      ref: "Adventure",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingDate: {
      type: Date,
      required: true,
    },
    numberOfParticipants: {
      type: Number,
      required: true,
      min: 1,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    participants: [
      {
        name: { type: String, required: true },
        age: { type: Number, required: true },
        contactNumber: { type: String, required: true },
      },
    ],
    specialRequirements: String,
  },
  { timestamps: true }
);

// Create indexes
AdventureBookingSchema.index({ adventure: 1 });
AdventureBookingSchema.index({ user: 1 });
AdventureBookingSchema.index({ bookingDate: 1 });
AdventureBookingSchema.index({ status: 1 });
AdventureBookingSchema.index({ paymentStatus: 1 });

AdventureBookingSchema.virtual("id").get(function (this: IAdventureBooking) {
  return this._id.toHexString();
});

AdventureBookingSchema.set("toJSON", { virtuals: true });

export default mongoose.model<IAdventureBooking>(
  "AdventureBooking",
  AdventureBookingSchema
);
